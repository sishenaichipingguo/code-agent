# 写完一个 AI 编程助手之后，我才确定 prompt 工程不是重点

用 Claude Code 用着用着我有个怪念头：这东西底下是不是就一个 while 循环？

试着拆了一下，发现真的就是：

```
用户消息 → 模型 → 文字？结束
                 → 工具？执行 → 把结果塞回去 → 继续
```

代码写出来不到 20 行：

```typescript
while (true) {
  const response = await model.chat({ messages, tools })
  if (response.type === 'text') return response.content

  const results = await executeTools(response.tools)
  messages.push({ role: 'assistant', content: response.tools })
  messages.push({ role: 'user', content: results })
}
```

跑通它不难。难的是让它**好用**。

我花了两个月把这个骨架做成能日常用的 Agent。过程中最反常识的发现是：模型已经够强了，prompt 工程不是瓶颈，**真正决定一个 Agent 是玩具还是工具的，是下面这四个工程细节**。

---

## 一、流式工具调用是碎片化的

非流式很爽，一次拿完整响应，分类型处理就行。但响应延迟感很差。

切到流式之后第一件事就翻车：工具调用是**分散在多个 chunk 里**到达的。

```
chunk 1: tool_name = "Read"
chunk 2: input = "{ \"file_path\": "
chunk 3: input = "\"/tmp/a.t"
chunk 4: input = "xt\" }"
chunk 5: done
```

最容易踩的坑：收到第一个 `tool_use` chunk 就去执行。拿到的 input 要么是空对象，要么是不合法的 JSON，工具立刻炸。

正确做法是**先收集，等 done 再执行**，并且用 Map，不要用数组：

```typescript
const completedTools = new Map<number, ToolCall>()

for await (const chunk of stream) {
  if (chunk.type === 'tool_use') {
    if (Object.keys(chunk.tool.input).length > 0) {
      completedTools.set(chunk.toolIndex, chunk.tool)
    }
  }
  if (chunk.type === 'done') {
    const results = await executeTools([...completedTools.values()])
    // ...
  }
}
```

为什么用 Map：chunk 不保证按序到达，`toolIndex` 才是稳定的 key。

这种细节，读 SDK 文档读不到，看官方 example 也学不到，要自己踩进去才知道。

---

## 二、跨进程的上下文你不显式传，就一定丢

记忆系统我做成独立的 Worker 进程：Agent 把事件 POST 给 Worker，Worker 异步落 SQLite + 跑 embedding。架构上是对的。

但调试一周后我发现召回率低得离谱，几乎什么都查不到。

最后定位到这一行代码：

```typescript
await hooks.fire('post-tool-use', {
  TOOL_NAME: tool.name,
  TOOL_RESULT: result,
  // SESSION_ID 没传
})
```

Worker 收到 observation 之后，session_id 是空的，写进数据库就成了孤儿数据，下次查询永远找不到。

加一行就好：

```typescript
SESSION_ID: sessionManager?.getCurrentSession()?.id ?? 'unknown'
```

教训不是"下次别忘了传字段"。是更普遍的规则：

> **跨进程边界上，任何隐式上下文都不存在。Trace id、session id、user id —— 不显式传，对方就拿不到。**

单进程内你还能靠闭包、AsyncLocalStorage、全局变量糊弄过去。一旦跨进程，这些全部失效。所有上下文必须当成数据，跟随消息一起发出去。

---

## 三、语义召回阈值是调出来的，不是算出来的

记忆 v1 我用 SQL LIKE 做关键词匹配。上次说"重构认证模块"，这次问"auth 改了什么"——找不到，"认证" 和 "auth" 字面上不命中。

v2 换成 embedding + 向量搜索。本地跑 `all-MiniLM-L6-v2`（50MB），单次召回 50–200ms，不花 API 钱。

真正难的不是接入向量库，是**相似度阈值定多少**。我试了三档：

| 阈值 | 现象 |
|------|------|
| 0.7 | 几乎召不回任何东西。"修了 auth.ts" 和 "auth 模块有问题" 在向量空间也对不上 |
| 0.1 | 召回一堆噪音。system prompt 被撑到几千 token，模型反而被干扰，回答质量下降 |
| 0.3 | 相关的能召回，明显不相关的被过滤掉 |

0.3 不是算出来的，是用真实对话**逐档试**出来的。

更一般的结论：

> **任何涉及"相关性"的阈值，都不要相信论文或博客里的数字。要在你自己的数据上跑出来。**

模型在你的领域上的向量分布、你的会话长度、你的 chunking 策略，都会让阈值偏移。别人的 0.7 在你这里可能等价于 0.3。

---

## 四、并发安全要工具自己说，不要让框架去猜

AI 经常一口气甩三个工具：读三个文件，或者 grep + read + write。

- 全串行：慢，体验差。
- 全并行：两个写操作撞到一起就炸。

让框架去**猜**哪些能并行，是死胡同——它不知道工具的语义。

干脆让每个工具自己声明：

```typescript
class ReadTool {
  isConcurrencySafe() { return true }   // 只读，永远安全
}

class WriteTool {
  isConcurrencySafe(input) {
    return false                         // 写操作，永远不安全
  }
}
```

调度逻辑一行判断：

```typescript
const allSafe = tools.every(t => registry.get(t.name)?.isConcurrencySafe(t.input))
return allSafe ? Promise.all(tools.map(run)) : runSerial(tools)
```

这个设计的关键不是省时间，是**职责分配**：

> **把语义留给工具，把调度留给框架。**

框架不需要知道 Read 和 Write 在做什么，只需要问一句"你能并行吗"。新增工具不用改调度器，改调度器不用动工具。

---

## 所以呢

看 LangChain、AutoGPT 这些 Agent 框架的文档，你会以为 Agent 的难点在 prompt 工程、在 chain 抽象、在 memory 设计。

自己从零写一遍之后我的真实判断是：**这些抽象都是表象**。

真正决定一个 Agent 好不好用的，是上面这种工程问题——流式状态机、跨进程上下文、阈值调参、并发安全。每一个都不需要 AI 知识，全部是普通后端工程师该会的东西。

这也是为什么大部分套壳产品体验都很差：他们解决了 prompt 问题，把工程问题留给了用户的耐心去消化。

代码开源在 GitHub，从零开始可读：[code-agent](https://github.com/your-handle/code-agent)。欢迎拍砖。

---

这四个判断里每一个都展开够再写一篇。完整连载：

1. [把 AI Agent 拆成两个进程：单进程方案我跑了一周才放弃](./blog-ai-agent-process-model.md) —— 进程模型为什么是 UX 决策
2. [AI Agent 的权限不该写在框架里：每个工具自己说](./blog-ai-agent-permissions.md) —— 22 行的权限引擎
3. [让工具自己声明并发安全：我把调度逻辑砍到一行](./blog-ai-agent-tool-dispatch.md) —— 调度器不应该知道工具语义
4. [AI Agent 对话太长怎么办：三种压缩策略和一个自动兜底](./blog-ai-agent-context-compression.md) —— 上下文窗口管理
5. [AI Agent 的记忆不是数据库问题，是信噪比问题](./blog-ai-agent-memory-system.md) —— 从关键词到语义召回的三个版本
6. [用 shell 命令做 AI Agent 的插件系统](./blog-ai-agent-hooks.md) —— 为什么 Hook 不是函数调用
