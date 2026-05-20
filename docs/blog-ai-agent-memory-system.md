# AI Agent 的记忆不是数据库问题，是信噪比问题

> 这是 [《写完一个 AI 编程助手之后，我才确定 prompt 工程不是重点》](./blog-ai-agent-from-scratch-v2.md) 系列的第五篇。前四篇讲了进程模型、权限、并发调度、[上下文压缩](./blog-ai-agent-context-compression.md)。这一篇讲记忆系统——我做了三个版本才做对。

所有 AI Agent 框架都在讲 memory。LangChain 有 ConversationBufferMemory、ConversationSummaryMemory、VectorStoreRetrieverMemory……名字一个比一个长。

但我做完自己的记忆系统之后，发现这些抽象全部在解决错误的问题。

记忆系统的难点不是"怎么存"，也不是"怎么查"。是**怎么控制注入到 system prompt 里的信噪比**。

---

## 一、v1：关键词匹配，几乎没用

第一版用 SQLite + LIKE 查询：

```sql
SELECT content FROM observations
WHERE content LIKE '%auth%'
ORDER BY created_at DESC
LIMIT 5
```

上次说"重构认证模块"，这次问"auth 改了什么"——找不到。"认证"和"auth"字面上不命中。

这不是 bug，是方案本身的天花板。关键词匹配只能处理**同义词完全一致**的情况，而人类说话从来不会用完全一致的词。

v1 存活了三天就被我删了。

---

## 二、v2：向量搜索，能用但吵

换成 embedding + ChromaDB。本地跑 `all-MiniLM-L6-v2`（384 维，50MB）：

```typescript
// src/worker/embedding/generator.ts
export async function generateEmbedding(text: string): Promise<number[]> {
  const truncated = text.slice(0, 2000)  // 模型限制 512 tokens
  const output = await embeddingPipeline(truncated, {
    pooling: 'mean',
    normalize: true
  })
  return Array.from(output.data)
}
```

查询时，把用户的问题也转成向量，找最近邻：

```typescript
// src/worker/embedding/chroma.ts
const queryEmbedding = await generateEmbedding(query)
const results = await this.collection.query({
  queryEmbeddings: [queryEmbedding],
  nResults: limit,
  where: project ? { project } : undefined
})
```

语义匹配确实好了——"认证"和"auth"能对上了。

但新问题来了：**召回太多噪音**。

我问"auth 模块改了什么"，它把所有跟 auth 沾边的历史全拉出来——包括三天前的一次 `git status`、一周前的一次 `ls src/auth/`、两周前的一次无关的 `grep`。

这些东西注入到 system prompt 里，模型反而被干扰了。它开始回答两周前的问题，而不是当前的问题。

> **召回率高不等于有用。注入到 prompt 里的每一条记忆都在消耗 token 预算，都在跟当前任务竞争注意力。**

---

## 三、阈值不是参数，是产品决策

ChromaDB 返回的是距离（distance），我转成相似度分数：`score = 1 - distance`。

然后用阈值过滤：

```typescript
const minScore = options.minScore || 0.3

for (let i = 0; i < results.ids[0].length; i++) {
  const distance = results.distances?.[0]?.[i] || 0
  const score = 1 - distance
  if (score < minScore) continue
  // ...
}
```

0.3 是怎么来的？试出来的。

| 阈值 | 现象 | 问题 |
|------|------|------|
| 0.7 | 几乎什么都召不回 | "修了 auth.ts" 和 "auth 模块有问题" 在向量空间也对不上 0.7 |
| 0.5 | 只有高度相似的能召回 | 漏掉太多有用的上下文 |
| 0.3 | 相关的能召回，明显不相关的被过滤 | 偶尔有噪音，但可接受 |
| 0.1 | 什么都召回 | system prompt 被撑到几千 token，模型被干扰 |

0.3 不是数学推导出来的。是我用真实对话跑了二十多次，逐档调出来的。

而且这个数字**只对我的场景有效**。换一个 embedding 模型、换一种 chunking 策略、换一种对话风格，最优阈值都会变。

> **任何涉及"相关性"的阈值，都不要相信论文或博客里的数字。要在你自己的数据上跑出来。**

---

## 四、Observer Agent：用 LLM 做结构化提取

原始的工具调用记录长这样：

```
tool: bash
input: {"command": "grep -r 'validateToken' src/"}
result: "src/auth/middleware.ts:  const valid = validateToken(token)\nsrc/auth/utils.ts:..."
```

直接存这个，embedding 质量很差——因为大部分内容是代码片段和路径，语义信息被淹没了。

所以我加了一个 Observer Agent（`src/worker/agents/observer.ts`）。它是一个独立的 LLM 调用，专门把原始工具记录转成结构化的观察：

```typescript
async processContinuation(context: ContinuationPromptContext): Promise<string> {
  const prompt = `继续观察用户的操作。
工具名称：${context.toolName}
输入参数：${JSON.stringify(context.toolInput).slice(0, 500)}
执行结果：${context.toolResponse.slice(0, 1000)}

请分析这个工具调用的意义，生成观察记录。`

  const response = await this.client.messages.create({
    model: this.model,
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }]
  })
  // ...
}
```

输出：

```
<observation type="tool_call">
用户执行了 grep，在 src/auth/ 目录下搜索 validateToken 的使用位置，
发现 middleware.ts 和 utils.ts 两处引用。可能在准备重构认证逻辑。
</observation>
```

这段文字的 embedding 质量比原始 grep 输出高一个量级——因为它包含了**意图**（"准备重构认证逻辑"），而不只是事实（"grep 返回了两行"）。

代价是每次工具调用多一次 LLM 调用。但这个调用跑在 Worker 进程里，异步的，不阻塞主循环。用户感知不到。

> **embedding 的质量取决于输入文本的语义密度。原始日志语义密度低，用 LLM 提炼一遍再存，召回质量翻倍。**

---

## 五、注入格式决定模型能不能用好记忆

召回之后怎么注入？我试过三种格式：

**格式 A：纯文本拼接**

```
之前你修过 auth.ts 的 token 过期逻辑。你还在 middleware.ts 里加了验证。
```

问题：模型分不清这是"当前任务的指令"还是"历史背景"。它会把历史当成当前任务去执行。

**格式 B：JSON 结构**

```json
{"memories": [{"session": "2026-04-15", "content": "修了 auth.ts"}]}
```

问题：浪费 token。JSON 的 key 名、引号、括号全是噪音。

**格式 C：带标签的结构化文本**（最终方案）

```
## Relevant Past Context

From session on 2026-04-15:
- [tool_call] Executed Write, created src/worker/db/sqlite.ts
- [summary] Implemented SQLite storage for observations

From session on 2026-04-17:
- [tool_call] Executed Edit, modified auth.ts to fix token expiry
```

这个格式有三个好处：

1. `## Relevant Past Context` 标题让模型明确知道这是历史，不是指令
2. `From session on ...` 给了时间锚点，模型能判断信息的新鲜度
3. `[tool_call]` / `[summary]` 标签让模型知道信息的可信度——tool_call 是事实，summary 是推断

> **注入格式不是美观问题，是模型能不能正确使用记忆的关键。格式错了，记忆越多模型越乱。**

---

## 六、记忆系统的真实架构

把上面的组件串起来，完整的数据流是：

```
用户发消息
  ↓
Agent 主循环执行工具
  ↓
Hook 触发 → HTTP POST 到 Worker
  ↓
Worker 收到原始工具记录
  ↓
Observer Agent 提炼成结构化观察
  ↓
Embedding Generator 生成向量
  ↓
ChromaDB 存储（向量 + 元数据）
  ↓
下次用户发消息时
  ↓
Agent 调用 memoryRecallFn(query)
  ↓
ChromaDB 语义搜索 → 阈值过滤 → 格式化
  ↓
注入 system prompt 末尾
  ↓
模型看到历史上下文，继续工作
```

每一步都可以独立失败而不影响主循环——因为整个记忆系统跑在 Worker 进程里，通过 HTTP 通信，hook 的 `onError` 设为 `'ignore'`。

记忆系统挂了，Agent 照常工作，只是没有历史上下文。这是有意为之的降级策略。

---

## 所以呢

做完三个版本，我对"AI Agent 的记忆"这个话题的判断是：

1. **存储不是问题**。SQLite、ChromaDB、Pinecone、随便什么都行。向量数据库之间的差异远小于你的 chunking 策略和阈值选择带来的差异。

2. **召回质量 = 输入质量 × 阈值精度**。输入质量靠 Observer Agent 提炼，阈值靠真实数据调参。两个都不能省。

3. **注入格式是被忽视的关键**。大部分教程讲到"查出来了"就结束了。但"查出来"到"模型能正确使用"之间，还有一个格式设计的鸿沟。

4. **记忆系统必须是可降级的**。它是增强，不是依赖。挂了不能影响主功能。

LangChain 的 Memory 抽象把这四个问题混在一起，用一个类解决。结果是每个问题都解决得不好，而且你没法单独调其中一个。

拆开来，每个问题独立解决，反而简单。

代码：[code-agent/src/worker](https://github.com/your-handle/code-agent/tree/main/src/worker)。embedding + chroma + observer 三个模块加起来不到 300 行。

---

下一篇讲这个系列最后一个反直觉的设计：**用 shell 命令做插件系统**——为什么 Hook 不是函数调用，而是 `bash -c`。
