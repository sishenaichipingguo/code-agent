# 上下文压缩 —— 让 Agent 记得更久

## 概念

每个 LLM 都有 context window 上限（比如 200k tokens）。

Agent 在长对话里会把所有历史消息都带上，很快就会撑爆。

常见解法：
1. **截断**：直接丢掉最早的消息——简单粗暴，但会丢失重要上下文
2. **摘要**：用模型把旧消息压缩成摘要——保留语义，但有额外 token 成本
3. **滑动窗口**：保留最近 N 轮完整消息 + 更早的摘要——两者折中

这个项目用的是方案 3，但实现比"滑动窗口"更复杂——它有三种压缩策略，还有一个"被动触发"机制。

## 项目实现

### 三种压缩策略

`src/core/context/manager.ts` 的 `ContextManager` 支持三种策略：

```typescript
export type CompressionStrategy = 'auto' | 'micro' | 'manual'

export class ContextManager {
  private compressors = {
    auto: new AutoCompressor(),    // 标准摘要压缩
    micro: new MicroCompactor(),   // 轻量快速压缩
    manual: new ManualCompactor()  // 用户主动触发的 /compact 命令
  }
}
```

- **`auto`**：标准策略，用同一个模型生成摘要，保留最近几轮完整消息。在 context 达到 80% 时自动触发。
- **`micro`**：轻量策略，压缩更激进，速度更快，适合 context 已经很紧张的情况。
- **`manual`**：用户主动输入 `/compact` 时触发，使用 `ManualCompactor`，会生成更详细的摘要（因为用户明确要求，可以多花一些 token）。

### 主动触发：80% 阈值

`AgentLoop` 在每轮循环后检查是否需要压缩：

```typescript
private async maybeCompress(messages: Message[], inputTokens?: number) {
  if (!this.context.contextManager || !inputTokens) return
  if (this.context.contextManager.shouldCompress(inputTokens)) {
    process.stderr.write(`⚠️  Context at ${inputTokens.toLocaleString()} tokens — compressing...\n`)
    const compressed = await this.context.contextManager.compress(messages, 'auto')
    messages.splice(0, messages.length, ...compressed)  // 原地替换
    process.stderr.write(`✓ Compressed to ${compressed.length} messages\n`)
  }
}

// ContextManager 里
shouldCompress(inputTokens: number): boolean {
  const limit = MODEL_CONTEXT_LIMITS[this.modelName] ?? 200_000
  return inputTokens > limit * 0.8  // 80% 阈值
}
```

`messages.splice(0, messages.length, ...compressed)` 是原地替换——不是创建新数组，而是修改原数组的内容。这样 `AgentLoop` 里所有持有 `messages` 引用的地方都能看到压缩后的结果。

### 被动触发：ptlRetry

除了主动检查，还有一个"被动触发"机制：`ptlRetry`（prompt-too-long retry）。

有时候 context 增长很快，主动检查来不及，API 直接返回"prompt is too long"错误。`ptlRetry` 捕获这个错误，自动压缩后重试：

```typescript
async ptlRetry<T>(messages: RawMessage[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err: any) {
    const msg = (err?.message ?? '').toLowerCase()
    const isPtl = PTL_PATTERNS.some(p => msg.includes(p))
    // PTL_PATTERNS = ['prompt is too long', 'prompt_too_long',
    //                 'context_length_exceeded', 'maximum context length']
    if (!isPtl) throw err  // 不是 PTL 错误，正常抛出

    // 是 PTL 错误：压缩后重试一次
    const compressed = await this.compress(messages, 'auto')
    messages.splice(0, messages.length, ...compressed)
    return fn()  // 重试，不再捕获（避免无限循环）
  }
}
```

`ptlRetry` 对上层完全透明——`AgentLoop` 只需要把 API 调用包在 `ptlRetry` 里，不需要关心 PTL 错误的处理：

```typescript
// AgentLoop 里
const response = this.context.contextManager
  ? await this.context.contextManager.ptlRetry(messages, () =>
      this.context.model.chat(request, tools)
    )
  : await this.context.model.chat(request, tools)
```

### Hooks 集成

压缩过程也有 hooks：

```typescript
async compress(messages: RawMessage[], strategy: CompressionStrategy): Promise<RawMessage[]> {
  // pre-compress：可以修改要压缩的消息（比如先归档到外部存储）
  if (this.hooks) {
    const transformed = await this.hooks.transform('pre-compress', { messages }, hookEnv)
    effectiveMessages = transformed.messages
  }

  const result = await compressor.run(effectiveMessages, this.model, this.modelName)
  const compressed = [this.buildPostCompressMessage(result.summary, strategy), ...result.messages]

  // post-compress：通知（比如记录压缩了多少消息）
  await this.hooks?.fire('post-compress', {
    AGENT_COMPRESS_ORIGINAL_COUNT: String(messages.length),
    AGENT_COMPRESS_RESULT_COUNT: String(compressed.length)
  })

  return compressed
}
```

压缩后的消息列表开头会插入一条特殊消息，告诉模型"之前的对话已经被压缩了，这是摘要"：

```
[Context compressed — auto (auto)]
Summary: <摘要内容>
The full conversation history above this point has been summarized. Continue the current task using this context.
```

这条消息让模型知道它的记忆被"截断"了，避免它因为找不到之前的消息而困惑。

## 动手练习

手动触发压缩，观察压缩前后的消息数量变化。在 `src/cli/yolo.ts` 里，给 agent 加一个 `/compact` 命令支持：

```typescript
// 在读取用户输入的地方
if (userInput.trim() === '/compact') {
  const before = loop.getMessages().length
  await loop.compact(loop.getMessages())
  const after = loop.getMessages().length
  process.stderr.write(`压缩完成：${before} → ${after} 条消息\n`)
  continue
}
```

先跑一个长任务让 context 积累，然后输入 `/compact`，观察消息数量从多少压缩到多少。再继续对话，验证 agent 还记得之前的关键信息。

---

> **English Summary:** `ContextManager` in `src/core/context/manager.ts` has three compression strategies (auto/micro/manual) and two trigger mechanisms: proactive (80% threshold check after each turn) and reactive (`ptlRetry` — catches prompt-too-long API errors and auto-compresses before retrying). The compressed message list starts with a special marker message so the model knows its history was summarized.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent) | Next: [Memory System →](./06-memory.md)
