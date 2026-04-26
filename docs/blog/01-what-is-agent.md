# 什么是 AI Agent？和普通 LLM 调用有什么区别

## 概念

你调用 ChatGPT API，发一条消息，收到一条回复——这是 LLM。

Agent 不一样：它收到任务后，会反复思考、调用工具、观察结果，直到任务完成。这个"反复"就是 Agent 的核心：**循环（Loop）**。

经典模式叫 ReAct（Reason + Act）：

1. 模型思考：我需要做什么？
2. 模型行动：调用某个工具
3. 观察结果：工具返回了什么？
4. 回到第 1 步，直到任务完成

一个简单类比：LLM 是"问答机"，Agent 是"能干活的员工"。

但这里有个关键问题：**循环怎么结束？**

模型的每次响应只有三种类型：
- `text`：模型认为任务完成，返回最终答案 → 退出循环
- `tool_use`：模型要调用工具，执行后把结果塞回消息列表 → 继续循环
- `error`：出错了 → 退出循环

这三路分支决定了 agent 的整个控制流。模型永远不会"主动停下来"——它只是在某一轮选择了返回 `text` 而不是 `tool_use`。

## 项目实现

循环逻辑在 `src/core/agent/loop.ts` 的 `AgentLoop` 类。先看它的上下文对象 `AgentContext`——这是 agent 运行所需的全部依赖：

```typescript
export interface AgentContext {
  model: ModelAdapter          // 模型适配器（Claude / Ollama / 其他）
  tools: ToolRegistry          // 工具注册表
  permissionContext: PermissionContext  // 权限上下文（yolo / safe / auto）
  logger: Logger
  streaming?: boolean          // 是否启用流式输出
  contextManager?: ContextManager      // 上下文压缩管理器
  systemPrompt?: string
  initialMessages?: Message[]  // 历史消息（用于恢复会话）
  sessionManager?: SessionManager      // 会话持久化
  hooks?: HookManager          // 生命周期钩子
  memoryRecallFn?: (query: string) => Promise<string>  // 语义记忆召回
  onChunk?: (chunk: ChunkEvent) => void  // 流式输出回调
}
```

`AgentContext` 不只是"配置"，它是 agent 的完整运行环境。每个字段都是可选的——你可以只传 `model` 和 `tools` 跑一个最简单的 agent，也可以把所有字段都配上，得到一个有记忆、有持久化、有 hooks 的生产级 agent。

核心循环：

```typescript
export class AgentLoop {
  async run(userMessage: string): Promise<string> {
    messages.push({ role: 'user', content: userMessage })

    // 触发 session-start hook
    await this.context.hooks?.fire('session-start', { AGENT_CWD: process.cwd() })

    // 语义记忆召回：从历史会话里找相关记忆，注入 system prompt
    const recalled = await this.context.memoryRecallFn?.(userMessage)
    const systemPrompt = recalled
      ? `${this.context.systemPrompt}\n\n${recalled}`
      : this.context.systemPrompt

    let turn = 0
    while (true) {
      turn++
      const response = await this.context.model.chat({ messages, system: systemPrompt }, tools)

      if (response.type === 'text') {
        // 任务完成，触发 post-sampling hook（可以修改最终输出）
        const sampled = await this.context.hooks?.transform('post-sampling', { text: response.content }, env)
        return sampled?.text ?? response.content
      }

      if (response.type === 'tool_use') {
        const results = await this.executeTools(response.tools)
        messages.push({ role: 'assistant', content: response.rawContent })
        messages.push({ role: 'user', content: results })  // 工具结果作为 user 消息
        continue
      }

      if (response.type === 'error') break
    }
  }
}
```

注意工具结果是以 `user` 角色塞回消息列表的——这是 Anthropic API 的约定，`tool_result` 类型的消息必须放在 `user` 轮里。

### 两条执行路径：streaming vs 非 streaming

`AgentLoop` 内部有两条完全不同的路径：

**非 streaming**（默认）：
```
model.chat() → 等待完整响应 → 处理 text/tool_use/error
```

**streaming**：
```
model.chatStream() → 逐 chunk 处理 → 收集完整工具调用 → 在 done 事件后统一执行
```

streaming 路径更复杂，因为工具调用的参数是分多个 chunk 流式到达的，必须等 `done` 事件才能确认参数完整。但它的好处是用户能实时看到模型的输出，而不是等整个响应完成。

streaming 路径还内置了**指数退避重试**：遇到可恢复的错误（如网络抖动、限流），会自动等待后重试，最多 10 次，等待时间用 Full Jitter 算法计算（随机化指数退避，避免多个 agent 同时重试造成雪崩）：

```typescript
const exponentialDelay = Math.min(60000, 1000 * Math.pow(2, attempt))
const delay = Math.random() * exponentialDelay  // Full Jitter
await new Promise(resolve => setTimeout(resolve, delay))
return this.runWithStream(request, messages, attempt + 1)
```

### 工具并行执行

`executeTools()` 里有一个重要优化：如果模型在同一轮里要调用多个工具，且这些工具都标记了 `isConcurrencySafe: true`，它们会**并行执行**：

```typescript
const allConcurrencySafe = tools.every(t =>
  this.context.tools.get(t.name)?.isConcurrencySafe(t.input) ?? false
)

if (allConcurrencySafe) {
  return Promise.all(tools.map(runTool))  // 并行
}
// 否则串行执行
```

读文件、搜索代码这类操作都是并发安全的，模型同时要读 5 个文件时不需要等第一个读完再读第二个。

## 动手练习

在 `AgentContext` 里有一个 `onChunk` 回调，每次工具开始和结束时都会触发。在 `src/cli/yolo.ts` 里给 agent 加上这个回调，实时打印工具调用信息：

```typescript
const loop = new AgentLoop({
  // ...其他配置
  onChunk: (chunk) => {
    if (chunk.type === 'tool_start') {
      process.stderr.write(`\n→ ${chunk.name}(${chunk.input})\n`)
    }
    if (chunk.type === 'tool_end') {
      process.stderr.write(`← ${chunk.name} 完成，耗时 ${chunk.duration}ms\n`)
    }
  }
})
```

运行 `bun run dev "帮我分析 src/ 下有哪些文件"` 观察每个工具调用的名称和耗时。你会看到 glob、read 等工具的调用顺序，以及哪些是并行执行的（它们的开始时间几乎相同）。

---

> **English Summary:** An Agent is an LLM in a loop — it reasons, acts (calls tools), observes results, and repeats until done. `AgentLoop` in `src/core/agent/loop.ts` has two execution paths (streaming and non-streaming), built-in Full Jitter retry for streaming, and parallel tool execution for concurrency-safe tools. The `AgentContext` object is the complete runtime environment — model, tools, permissions, hooks, session, and memory recall all live here.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent) | Next: [Tool Use →](./02-tool-use.md)
