# 给 AI 编程助手装上记忆：我踩过的那些坑

我做这个项目的起点很简单：用了几个 AI 编程工具之后，发现它们有个共同的问题——没有记忆。

每次开新对话，你得重新解释项目背景、上次做到哪了、有什么约定。如果你在做一个持续几天的任务，这个摩擦会让人很烦。

所以我决定自己造一个，从零开始，用 TypeScript + Bun。这篇文章不是介绍最终结果的，而是记录整个过程——包括那些走弯路的地方。

---

## 先把 Agent 跑起来

Agent 的核心逻辑其实不复杂：给模型发消息，模型要么回文字，要么调工具，调完工具把结果塞回去，继续问，直到模型不再调工具为止。

```
用户消息 → 模型 → 文字？结束
                 → 工具调用？执行 → 结果 → 模型 → ...
```

用代码写出来大概是这样：

```typescript
while (true) {
  const response = await model.chat({ messages, tools })

  if (response.type === 'text') {
    return response.content  // 结束
  }

  if (response.type === 'tool_use') {
    const results = await executeTools(response.tools)
    messages.push({ role: 'assistant', content: response.tools })
    messages.push({ role: 'user', content: results })
    // 继续循环
  }
}
```

这个骨架很快就能跑起来。但流式输出是第一个让我卡住的地方。

### 流式输出的坑：工具调用是碎片化的

非流式很好处理，一次拿到完整响应，判断类型，分支处理。

流式不一样。工具调用的数据是分散在多个 chunk 里的——先来工具名，再来参数的一部分，再来参数的另一部分。如果你在收到第一个 chunk 时就去执行工具，拿到的 input 是不完整的。

我最开始就犯了这个错误，执行出来的工具调用参数全是空的或者截断的。

解法是：**先收集，等 `done` 事件再执行**。

```typescript
const completedTools = new Map<number, any>()

for await (const chunk of stream) {
  if (chunk.type === 'tool_use' && chunk.toolIndex !== undefined) {
    // input 有内容才算完整
    if (chunk.tool.input && Object.keys(chunk.tool.input).length > 0) {
      completedTools.set(chunk.toolIndex, chunk.tool)
    }
  }

  if (chunk.type === 'done') {
    // 现在才执行
    const tools = Array.from(completedTools.values())
    const results = await executeTools(tools)
    // ...
  }
}
```

用 Map 而不是数组，是因为 chunk 不一定按顺序到，用 `toolIndex` 做 key 可以保证对应关系。

---

## 加记忆：第一版有多难用

Agent 跑起来之后，我开始做记忆系统。

最初的设计是：用 hooks 机制，在用户发消息和工具执行后，把数据发给一个独立的 Worker 服务，Worker 负责存储和后续的语义搜索。

架构上是对的，但第一版的使用体验很糟糕。

**启动流程是这样的：**

```bash
# 终端 1：先启动 Worker
bun run dev:worker

# 终端 2：再启动 Agent，还要手动配置 Hook
bun run dev
```

而且 Hook 配置要手动写进 `.agent/config.json`，格式是这样的：

```json
{
  "user-prompt-submit": [{
    "command": "curl -X POST http://localhost:37777/api/sessions/init ...",
    "onError": "ignore"
  }]
}
```

每次换机器或者换项目都要重新配。用了两天我自己就受不了了。

### v2：一条命令搞定

问题很清楚：用户不应该关心 Worker 是怎么启动的，Hook 是怎么配的。这些都应该是内部细节。

所以 v2 做了一件事：加了 `--with-memory` 参数，背后自动处理所有事情。

```bash
# 现在只需要这一条
bun run dev --with-memory "重构 auth.ts"
```

背后发生了什么：

```
CLI 检测到 --with-memory
  ↓
WorkerManager.start()
  ├─ 用 spawn 启动 Worker 子进程
  ├─ 轮询 /health 端点，等待就绪（最多 10 秒）
  └─ 动态生成 Hook 配置，注入到当前运行时
  ↓
Agent 正常运行，Hook 自动触发
  ↓
用户 Ctrl+C
  ↓
GracefulShutdown
  ├─ 发 SIGTERM 给 Worker
  ├─ 3 秒后还没停就 SIGKILL
  └─ 清理资源
```

父子进程绑定（`detached: false`），父进程退出时子进程自动跟着退，不会留下僵尸进程。

---

## v2 上线后的三个 bug

v2 发布之后，我自己用了一段时间，发现了三个 bug，每个都挺典型的。

### Bug 1：路径算错了

Worker 启动失败，报错：

```
Module not found "/Users/debug/workspace/code-agent/worker/server.ts"
```

原因是我用了 `__dirname` 来计算 Worker 的路径：

```typescript
// 错误的写法
spawn('bun', ['run', join(__dirname, '../../worker/server.ts')])
```

`__dirname` 是当前文件所在目录，但经过 Bun 打包之后，`__dirname` 指向的位置变了，路径就算错了。

修法很简单，改用 `process.cwd()`——始终从项目根目录出发：

```typescript
// 正确的写法
const workerPath = join(process.cwd(), 'src/worker/server.ts')
spawn('bun', ['run', workerPath])
```

这个 bug 的教训：**在打包环境里，`__dirname` 不可靠，用 `process.cwd()` 更稳**。

### Bug 2：模型名硬编码

Worker 内部用 Claude API 来处理会话摘要，模型名写死了：

```typescript
// 写死了
model: 'claude-3-5-sonnet-20241022'
```

结果换了 API 提供商之后，这个模型名不被支持，Worker 直接报 503。

修法是让模型名可配置：

```typescript
constructor(apiKey: string, model?: string) {
  this.model = model || process.env.WORKER_MODEL || 'claude-3-5-sonnet-20241022'
}
```

这个 bug 的教训：**任何外部依赖的标识符（模型名、端点、版本号）都不应该硬编码**，至少要有环境变量覆盖的出口。

### Bug 3：SESSION_ID 没传

这个 bug 最隐蔽。症状是：记忆系统在运行，但数据没有正确关联到 session，查询时总是找不到。

排查了一会儿才发现：`post-tool-use` hook 触发时，我忘了把 `SESSION_ID` 传进去：

```typescript
// 漏掉了 SESSION_ID
await hooks.fire('post-tool-use', {
  AGENT_CWD: process.cwd(),
  TOOL_NAME: tool.name,
  TOOL_INPUT: JSON.stringify(tool.input),
  TOOL_RESULT: resultStr,
  // SESSION_ID 没有！
})
```

Worker 收到 observation 之后，拿着空的 SESSION_ID 去找 session，当然找不到。

加上就好了：

```typescript
await hooks.fire('post-tool-use', {
  AGENT_CWD: process.cwd(),
  TOOL_NAME: tool.name,
  TOOL_INPUT: JSON.stringify(tool.input),
  TOOL_RESULT: resultStr,
  SESSION_ID: sessionManager?.getCurrentSession()?.id || 'unknown'
})
```

这个 bug 的教训：**跨进程通信时，上下文信息（session id、trace id 之类）要显式传递，不能假设对方能自己推断出来**。

---

## 记忆系统 v1 的根本问题

修完这三个 bug 之后，记忆系统能正常运行了。但用了一段时间，我发现它其实没什么用。

原因是：v1 的记忆是**关键词搜索**，存在 SQLite 里，用 SQL LIKE 查询。

这意味着：你上次说"重构认证模块"，这次问"auth 相关的改动"，它找不到，因为"认证"和"auth"不匹配。

记忆系统的价值在于**语义相关性**，不是字面匹配。

### Phase 2：加上语义搜索

这是整个项目里改动最大的一次。

核心思路：把每条记忆转成向量（embedding），存进向量数据库（ChromaDB）。查询时，把当前问题也转成向量，找最相似的历史记录。

**为什么用本地 embedding 模型？**

最开始我想直接调 OpenAI 的 embedding API，省事。但算了一下：每次对话开始都要召回记忆，每次召回都要调 API，加上网络延迟，每次对话要多等 200-500ms。

用本地模型（`all-MiniLM-L6-v2`，50MB）就没这个问题，召回延迟在 50-200ms 以内，而且不花钱。

代价是首次启动要下载模型，大概 30 秒。之后就快了。

**相似度阈值 0.3 是怎么来的？**

调出来的。

最开始设的 0.7，太严格，基本什么都召不回来。改成 0.1，又太宽松，召回一堆不相关的内容，把 system prompt 撑得很大，反而干扰了模型。

0.3 是在"召回率"和"精确率"之间找到的平衡点——大部分语义相关的内容能召回，明显不相关的会被过滤掉。

**召回的内容怎么注入？**

格式化成结构化文本，拼在 system prompt 末尾：

```
## Relevant Past Context

From session on 2026-04-15:
- [tool_call] User executed Write, created src/worker/db/sqlite.ts
- [summary] Implemented SQLite storage for observations

From session on 2026-04-17:
- [tool_call] User executed Edit, modified auth.ts to fix token expiry
```

模型看到这段内容，就知道之前做过什么，可以在此基础上继续工作。

---

## 一个我没想到的问题：UI 模式忘了接入

v2 发布之后，有人反馈说 `--with-memory` 在 UI 模式下不工作。

我去看代码，发现了一个低级错误：我在 `yolo.ts`（CLI 模式）里加了 Worker 启动逻辑，但 `yolo-ui.tsx`（UI 模式）里完全没有。

两个入口文件，只改了一个。

这种错误很常见，但也很容易避免：**如果两个地方有相同的逻辑，要么抽成公共函数，要么在改一个的时候，明确检查另一个是否也需要改**。

---

## 权限系统：简单但够用

工具执行有个根本矛盾：你想让 AI 快，但你又怕它乱删文件。

我设计了两种模式：

- **YOLO 模式**：bypass 所有权限检查，适合你信任 AI 的场景
- **Safe 模式**：每个工具调用走规则匹配，危险操作需要确认

权限引擎的核心逻辑只有 30 行：

```typescript
export function decide(tool, input, ctx): PermissionResult {
  if (ctx.mode === 'bypass') return { type: 'allow' }

  const toolResult = tool.checkPermissions(input, ctx)
  if (toolResult.type === 'deny') return toolResult

  const matched = ctx.allowRules.some(rule => matchesRule(rule, toolName, input))
  if (matched) return { type: 'allow' }

  if (ctx.mode === 'auto') {
    return { type: 'deny', reason: 'requires confirmation' }
  }

  return toolResult
}
```

每个工具自己实现 `checkPermissions`。`rm` 默认要求确认，`read` 默认放行。用户可以在配置里加白名单规则覆盖。

这个设计的关键是**工具和权限解耦**：加新工具不需要改权限引擎，改权限策略不需要动工具代码。

---

## 工具并发：一个小优化

AI 有时候会同时调用多个工具，比如同时读三个文件。串行跑太慢，但并行跑有风险——两个工具同时写同一个文件会出问题。

解法是让每个工具声明自己是否"并发安全"：

```typescript
class ReadTool {
  isConcurrencySafe(): boolean { return true }  // 只读，安全
}

class WriteTool {
  isConcurrencySafe(): boolean { return false }  // 写操作，不安全
}
```

执行时，如果这一批工具全部安全，就 `Promise.all` 并行；否则串行：

```typescript
const allSafe = tools.every(t => registry.get(t.name)?.isConcurrencySafe(t.input))

if (allSafe) {
  return Promise.all(tools.map(runTool))
}

for (const tool of tools) {
  results.push(await runTool(tool))
}
```

---

## 回头看

做完这个项目，我对"AI Agent 的难点在哪"有了不同的理解。

我最开始以为难点是 prompt 工程——怎么让模型更聪明、更准确。

实际上，模型本身已经很强了，真正的难点是**工程问题**：

- 流式输出的状态管理
- 跨进程通信的上下文传递
- 记忆系统的召回质量
- 用户体验（两个终端 vs 一条命令）

这些问题框架帮你封装掉了，但封装意味着你不理解它，出问题也不知道从哪下手。

从零写一遍，每个设计决策都是你自己做的，出了问题你知道去哪找。

代码开源在 GitHub，欢迎看看。
