# 上下文压缩 —— 对抗遗忘的工程

## 一、任务跑到一半，突然报错

有一次我让 agent 分析一个大型代码库，任务是"找出所有和支付相关的代码，整理成文档"。

agent 跑了大概 20 分钟，读了几十个文件，分析了一半，然后报错：

```
Error: prompt is too long. Max tokens: 200000, got: 203847
```

任务失败，所有进度丢失。

这就是 context window 的问题。agent 每读一个文件，文件内容就会被塞进消息列表。读的文件越多，消息列表越长，最终超过模型的 context window 上限，API 直接拒绝请求。

**这不是偶发的边界情况，是所有长任务都会遇到的问题。**

解法是上下文压缩：在 context 快满之前，把早期的消息压缩成摘要，腾出空间给新的内容。

## 二、为什么 Context Window 有上限

要理解上下文压缩，先要理解为什么 context window 不能无限大。

Transformer 架构的核心是**自注意力机制（Self-Attention）**。它让模型在生成每个 token 时，都能"看到"序列里的所有其他 token，并计算它们之间的相关性。这是 Transformer 强大的根本原因——它能捕捉长距离依赖关系。

但这个能力有代价：**计算复杂度是序列长度的平方**。序列长度翻倍，计算量变成 4 倍。序列长度增加 10 倍，计算量增加 100 倍。这不是工程实现的问题，而是算法的根本性质。

近年来各家模型的 context window 在快速扩大（GPT-4 的 128k、Claude 的 200k、Gemini 的 1M），但这并不意味着"context window 越大越好"：

**成本**：更长的 context 意味着更多的 token，每次调用的成本更高。一个 200k token 的 context，每次调用的成本可能是 10k token 的 20 倍。对于一个需要多轮交互的 agent 任务，这个成本会快速累积。

**延迟**：更长的 context 意味着更慢的响应。在需要快速交互的场景里，这是不可接受的。

**注意力稀释**：研究表明，当 context 很长时，模型对中间部分的"注意力"会下降——它更容易记住开头和结尾，忽略中间的内容。这叫 **"Lost in the Middle"** 问题。即使 context window 足够大，把所有历史都塞进去也不一定是最好的策略。

所以，即使 context window 在扩大，**如何管理 context 仍然是 agent 系统的核心工程问题**。

## 三、三种压缩策略

这个项目的 `ContextManager` 支持三种策略，对应三种不同的场景：

**`auto`（标准摘要压缩）**：用同一个模型生成摘要，保留最近几轮完整消息，把更早的消息压缩成摘要。在 context 达到 80% 时自动触发。这是最常用的策略，在质量和成本之间取得平衡。

**`micro`（轻量快速压缩）**：压缩更激进，速度更快，生成的摘要更简短。适合 context 已经很紧张、需要快速释放空间的情况。质量比 `auto` 差，但速度更快。

**`manual`（用户主动触发）**：用户输入 `/compact` 时触发，生成更详细的摘要（因为用户明确要求，可以多花一些 token）。适合用户感觉 agent 开始"忘事"时主动触发。

为什么需要三种策略而不是一种？因为不同场景的需求不同：
- 正常运行时，`auto` 的质量和成本平衡最好
- context 已经爆了，需要 `micro` 快速救场
- 用户主动管理时，`manual` 提供最好的质量

这是**策略模式（Strategy Pattern）**的典型应用：把"如何压缩"的决策从"何时压缩"的逻辑里分离出来，让两者可以独立变化。

## 四、两种触发机制：主动 + 被动

### 主动触发：80% 阈值

`AgentLoop` 在每轮循环后检查是否需要压缩：

```typescript
private async maybeCompress(messages: Message[], inputTokens?: number) {
  if (!this.context.contextManager || !inputTokens) return
  if (this.context.contextManager.shouldCompress(inputTokens)) {
    const compressed = await this.context.contextManager.compress(messages, 'auto')
    messages.splice(0, messages.length, ...compressed)  // 原地替换
  }
}

shouldCompress(inputTokens: number): boolean {
  const limit = MODEL_CONTEXT_LIMITS[this.modelName] ?? 200_000
  return inputTokens > limit * 0.8  // 80% 阈值
}
```

为什么是 80% 而不是 90% 或 95%？这是一个权衡：
- 阈值越高，压缩越晚，保留的历史越多，但留给工具结果的空间越少
- 阈值越低，压缩越早，成本越高（更频繁地生成摘要），但更安全

80% 是经验值，在大多数场景下效果不错。如果你的任务会产生大量工具结果（比如读取很多大文件），可以把阈值调低到 70%。

`messages.splice(0, messages.length, ...compressed)` 是原地替换——不是创建新数组，而是修改原数组的内容。这样 `AgentLoop` 里所有持有 `messages` 引用的地方都能看到压缩后的结果，不需要传递新的引用。

### 被动触发：ptlRetry

主动检查有一个盲区：如果某一轮的工具结果特别大（比如读了一个几万行的文件），context 可能在一轮之内从 70% 跳到 110%，主动检查来不及。

这时 API 会直接返回"prompt is too long"错误。`ptlRetry` 捕获这个错误，自动压缩后重试：

```typescript
async ptlRetry<T>(messages: RawMessage[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err: any) {
    const msg = (err?.message ?? '').toLowerCase()
    const isPtl = PTL_PATTERNS.some(p => msg.includes(p))
    // PTL_PATTERNS = ['prompt is too long', 'prompt_too_long',
    //                 'context_length_exceeded', 'maximum context length']
    if (!isPtl) throw err

    // 是 PTL 错误：压缩后重试一次
    const compressed = await this.compress(messages, 'auto')
    messages.splice(0, messages.length, ...compressed)
    return fn()  // 重试，不再捕获（避免无限循环）
  }
}
```

`ptlRetry` 对上层完全透明——`AgentLoop` 只需要把 API 调用包在 `ptlRetry` 里，不需要关心 PTL 错误的处理：

```typescript
const response = this.context.contextManager
  ? await this.context.contextManager.ptlRetry(messages, () =>
      this.context.model.chat(request, tools)
    )
  : await this.context.model.chat(request, tools)
```

这是**"在错误发生时自动修复"**的设计模式，比"提前预测何时需要压缩"更健壮——你无法预测所有可能导致 context 溢出的情况，但你可以在溢出时自动恢复。

这里再啰嗦一下：`ptlRetry` 只重试一次，不再捕获第二次的 PTL 错误。这是有意为之——如果压缩后还是太长，说明有更根本的问题（比如单个工具结果就超过了 context window），需要在工具层面解决，而不是无限压缩。分析"为什么压缩后还是太长"时，要记得这个设计。

### 压缩后的标记消息

压缩后的消息列表开头会插入一条特殊消息：

```
[Context compressed — auto]
Summary: <摘要内容>
The full conversation history above this point has been summarized.
Continue the current task using this context.
```

这条消息有两个作用：
1. **告知模型**：让模型知道它的历史被压缩了，避免它因为找不到之前的消息而困惑
2. **提供摘要**：让模型能基于摘要继续工作，而不是从零开始

## 五、边界条件和陷阱

**摘要质量的不可预测性**：模型生成摘要时，它不知道哪些信息在未来会用到。有时候摘要会丢失关键的技术细节（比如某个函数的具体参数），导致 agent 在后续步骤里犯错。这是有损压缩的固有局限，没有完美解法。

**压缩后的幻觉**：压缩后，模型可能"记得"一些实际上没有发生的事情（因为摘要是模型生成的，可能包含幻觉）。如果任务对历史的准确性要求很高，需要谨慎使用压缩。

**压缩时机和 hooks 的交互**：`pre-compress` hook 可以修改要压缩的消息，`post-compress` hook 可以记录压缩统计。如果 `pre-compress` hook 执行失败（比如超时），压缩会继续但使用原始消息。需要注意 hook 失败对压缩结果的影响。

**本地模型的 context 限制**：本地模型（Ollama）的 context window 通常比云端模型小很多（比如 4k vs 200k）。如果你用本地模型跑复杂任务，压缩会非常频繁，而且每次压缩的质量也更差（因为用来生成摘要的模型能力也更弱）。

## 六、与其他组件的关系

上下文压缩和记忆系统（第 6 篇）是互补的：
- **上下文压缩**：管理"当前会话"的短期记忆，通过摘要保留语义
- **记忆系统**：管理"跨会话"的长期记忆，通过文件持久化保留重要信息

两者的协作模式：当 agent 判断某些信息"值得长期保留"时，应该先用 `memory_save` 工具把它存入记忆系统，再让上下文压缩把它从短期记忆里清除。这样重要信息不会因为压缩而丢失。

上下文压缩和 hooks 系统（第 9 篇）有直接交互：`pre-compress` 和 `post-compress` 两个 hook 事件让你可以在压缩前后注入自定义逻辑，比如记录压缩统计、过滤敏感信息等。

上下文压缩和多模型支持（第 7 篇）也有关联：不同模型的 context window 大小不同，`MODEL_CONTEXT_LIMITS` 表里存了各模型的限制，`shouldCompress()` 根据当前模型选择正确的阈值。

## 七、动手练习

**练习 1：观察压缩过程**

在 `ContextManager.compress()` 里加日志：

```typescript
async compress(messages: RawMessage[], strategy: CompressionStrategy): Promise<RawMessage[]> {
  const before = messages.length
  const beforeTokens = estimateTokens(messages)
  // ...压缩逻辑...
  const after = result.length
  const afterTokens = estimateTokens(result)
  process.stderr.write(
    `[compress] ${strategy}: ${before} msgs / ${beforeTokens} tokens → ${after} msgs / ${afterTokens} tokens\n`
  )
  return result
}
```

跑一个长任务，观察压缩触发的时机、压缩前后的消息数量和 token 数量变化。

**练习 2：调整阈值，观察影响**

把 80% 阈值改成 50%，跑同样的任务，对比：
- 压缩触发的频率（更频繁）
- 总 token 成本（更高，因为更频繁地生成摘要）
- agent 的"记忆质量"（可能更差，因为压缩更激进）

再改成 95%，观察相反的效果。这个实验能让你直观感受到阈值选择的权衡。

**练习 3：触发 ptlRetry**

写一个工具，返回一个非常大的字符串（比如 100000 个字符），让 agent 调用它。观察 ptlRetry 是否被触发，以及触发后 agent 是否能继续正常工作。

**练习 4：预测压缩后的行为**

给 agent 一个多步骤任务：先让它分析一个文件，记住某个具体的函数签名，然后做一些其他操作（让 context 增长），最后让它引用之前记住的函数签名。在压缩发生后，观察 agent 是否还能正确引用——这能让你直观感受到有损压缩的影响。

---

> **English Summary:** Context window limits are fundamental to Transformer architecture (quadratic attention complexity). Larger windows don't eliminate the problem — cost, latency, and "Lost in the Middle" attention dilution remain. `ContextManager` has three strategies (auto/micro/manual) and two trigger mechanisms: proactive (80% threshold) and reactive (`ptlRetry` — catches prompt-too-long errors and auto-compresses). Compression is lossy — critical information should be saved to the memory system before compression removes it from context.
>
> ⭐ Next: [Memory System →](./06-memory.md)
