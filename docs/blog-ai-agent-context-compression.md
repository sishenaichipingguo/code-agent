# AI Agent 对话太长怎么办：三种压缩策略和一个自动兜底

> 这是 [《写完一个 AI 编程助手之后，我才确定 prompt 工程不是重点》](./blog-ai-agent-from-scratch-v2.md) 系列的第七篇。前六篇讲了进程模型、权限、并发调度、记忆、Hook。这一篇讲一个所有 Agent 都会遇到但很少有人讲清楚的问题：**上下文窗口快满了怎么办**。

Claude 有 200K token 的上下文窗口。听起来很大。

但一个真实的 Agent 对话长这样：

```
用户消息 (50 tokens)
  → 模型回复 + 3 个工具调用 (800 tokens)
  → 3 个工具结果 (每个 2000-5000 tokens)
  → 模型回复 + 2 个工具调用 (600 tokens)
  → 2 个工具结果 (每个 3000 tokens)
  → ...
```

一次"读三个文件然后改一个"的操作，轻松吃掉 15000–20000 tokens。十轮对话下来就是 150K–200K。

到了 80% 容量（160K），模型开始出问题——回复变慢、开始遗忘早期上下文、偶尔幻觉。到了 100%，API 直接报错：`prompt_too_long`。

你不能让用户手动开新对话。Agent 的价值就在于**连续工作**。

---

## 一、80% 阈值：在崩溃之前压缩

第一个设计决策：什么时候触发压缩？

```typescript
// src/core/context/manager.ts
const COMPRESS_THRESHOLD = 0.8

shouldCompress(inputTokens: number): boolean {
  const limit = MODEL_CONTEXT_LIMITS[this.modelName] ?? 200_000
  return inputTokens > limit * COMPRESS_THRESHOLD
}
```

80% 不是随便选的：

- **太早（60%）**：频繁压缩，每次都丢信息，模型反复"失忆"
- **太晚（95%）**：压缩本身要调 LLM 做摘要，摘要请求也要 token。如果剩余空间不够发摘要请求，就死锁了
- **80%**：留 20% 的余量给压缩操作本身 + 下一轮对话的空间

API 返回的 `inputTokens` 是精确的——不需要自己数 token，用 API 告诉你的数字就行。

---

## 二、三种压缩策略，不是一种

第一版我只做了一种压缩：把所有历史丢给 LLM 做摘要。

跑了几天发现两个问题：

1. **摘要太粗**：一段话概括了 20 轮对话，关键细节（文件路径、错误信息、具体决策）全丢了
2. **摘要太贵**：把 150K token 的历史全发给 LLM 做摘要，这个摘要请求本身就要花 150K input token 的钱

所以我做了三种策略：

### Auto（自动）：保留最近 3 轮，摘要其余

```typescript
// src/core/context/compressors/auto.ts
const KEEP_RECENT_ROUNDS = 3

const keepCount = KEEP_RECENT_ROUNDS * 2  // 每轮 = user + assistant
const toSummarize = messages.slice(0, messages.length - keepCount)
const toKeep = messages.slice(messages.length - keepCount)

const summary = await model.chat({
  messages: [
    ...toSummarize,
    { role: 'user', content: 'Summarize the above conversation concisely. Preserve: key decisions, files modified, errors resolved, context needed to continue.' }
  ],
  max_tokens: 1024
})
```

**什么时候用**：自动触发（到 80% 阈值时）。保留最近 3 轮的完整上下文（模型还能看到刚才在做什么），早期历史压缩成一段摘要。

**代价**：早期的具体文件路径、错误堆栈可能丢失。但最近 3 轮是完整的，当前任务不受影响。

### Micro（微压缩）：只压缩最老的 20%

```typescript
// src/core/context/compressors/micro.ts
const MICRO_FRACTION = 0.2

const chunkSize = Math.max(2, Math.floor(messages.length * MICRO_FRACTION))
const toSummarize = messages.slice(0, chunkSize)
const toKeep = messages.slice(chunkSize)
```

**什么时候用**：上下文接近阈值但还不紧急时。只砍掉最老的 20%，损失最小。

**代价**：压缩幅度小，可能很快又触发。但每次丢的信息少，适合"慢慢压"的场景。

### Manual（手动 /compact）：全部压缩成结构化摘要

```typescript
// src/core/context/compressors/manual.ts
const summary = await model.chat({
  messages: [
    ...messages,
    { role: 'user', content: `Create a structured context summary:
- Files created or modified
- Decisions made
- Errors encountered and resolved
- Current task
- Open questions or blockers` }
  ],
  max_tokens: 2048
})

return { messages: [], summary }  // 清空所有历史，只留摘要
```

**什么时候用**：用户主动输入 `/compact`。适合"我要换个方向了，之前的细节不重要了"的场景。

**代价**：所有历史细节丢失。但摘要是结构化的，关键信息保留率比 auto 高（因为 prompt 明确要求了保留哪些维度）。

---

## 三、压缩后的消息格式

压缩完之后，历史变成了：

```typescript
[
  { role: 'user', content: '[Context compressed — auto]\nSummary: ...\nThe full conversation history above this point has been summarized. Continue the current task using this context.' },
  // ... 保留的最近 N 轮
]
```

这个格式有两个关键设计：

**1. 明确告诉模型"历史被压缩了"**

`[Context compressed — auto]` 这个标记让模型知道：前面的对话不是完整的，如果它发现信息缺失，不是幻觉，是真的被压缩掉了。

没有这个标记，模型会试图"回忆"不存在的上下文，产生幻觉。

**2. 摘要放在 user 消息里，不是 system prompt 里**

system prompt 是固定的（工具定义、角色设定）。压缩摘要是动态的、会被覆盖的。放在 user 消息里，下次再压缩时直接替换，不会污染 system prompt。

---

## 四、PTL 兜底：API 报错了再压一次

即使有 80% 阈值，还是可能翻车——比如一个工具返回了一个巨大的文件内容（50K tokens），一下子从 75% 跳到 100%。

这时候 API 会报 `prompt_too_long`（PTL）错误。

我的兜底策略：**捕获 PTL，压缩一次，重试**。

```typescript
// src/core/context/manager.ts
async ptlRetry<T>(messages: RawMessage[], fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err: any) {
    const msg = (err?.message ?? '').toLowerCase()
    const isPtl = PTL_PATTERNS.some(p => msg.includes(p))
    if (!isPtl) throw err

    // 压缩后重试一次
    const compressed = await this.compress(messages, 'auto')
    messages.splice(0, messages.length, ...compressed)
    return fn()
  }
}
```

`PTL_PATTERNS` 覆盖了不同 API 的错误格式：

```typescript
const PTL_PATTERNS = [
  'prompt is too long',
  'prompt_too_long',
  'context_length_exceeded',
  'maximum context length'
]
```

只重试一次。如果压缩后还是 PTL，说明问题不在历史长度（可能是 system prompt 本身太大），继续重试没意义。

> **PTL 不是异常，是正常运行的一部分。任何长对话 Agent 都会遇到，区别是你有没有自动恢复。**

---

## 五、Hook 集成：压缩前可以归档

压缩意味着丢信息。有些场景你想在丢之前做点什么——比如把完整历史写到磁盘、发到日志系统、或者更新记忆数据库。

所以压缩前后都有 hook：

```typescript
// pre-compress: 压缩前，可以归档或修改消息
let effectiveMessages = messages
if (this.hooks) {
  const transformed = await this.hooks.transform('pre-compress', { messages }, hookEnv)
  effectiveMessages = transformed.messages
}

// 执行压缩
const result = await compressor.run(effectiveMessages, this.model, this.modelName)

// post-compress: 压缩后，通知
await this.hooks?.fire('post-compress', {
  AGENT_COMPRESS_ORIGINAL_COUNT: String(messages.length),
  AGENT_COMPRESS_RESULT_COUNT: String(compressed.length)
})
```

`pre-compress` 是 transform 型——hook 可以修改消息列表（比如把某些重要消息标记为"不可压缩"）。`post-compress` 是 fire 型——纯通知，用于监控。

---

## 六、流式重试：指数退避 + Full Jitter

压缩解决的是"上下文太长"。但还有另一类错误：API 暂时不可用（限流、网络抖动、服务端过载）。

这种错误需要重试，但不能无脑重试——否则会加剧服务端压力。

```typescript
// src/core/agent/loop.ts — runWithStream
if (error.recoverable && attempt < maxRetries) {
  const baseDelay = 1000
  const maxDelay = 60000
  const exponentialDelay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt))
  const delay = Math.random() * exponentialDelay  // Full Jitter

  await new Promise(resolve => setTimeout(resolve, delay))
  return this.runWithStream(request, messages, attempt + 1)
}
```

**为什么用 Full Jitter 而不是 Equal Jitter？**

Equal Jitter：`delay = exponentialDelay / 2 + random(0, exponentialDelay / 2)`
Full Jitter：`delay = random(0, exponentialDelay)`

Full Jitter 的最小延迟可以是 0，Equal Jitter 的最小延迟是 `exponentialDelay / 2`。

当多个 Agent 实例同时被限流时，Full Jitter 让它们的重试时间分布更均匀——有的立刻重试成功，有的等很久。Equal Jitter 让所有实例都至少等一半时间，反而容易在同一时刻再次撞车。

AWS 的论文 [Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) 有详细对比。结论是 Full Jitter 在高并发场景下完成时间最短。

**最大重试 10 次，最大延迟 60 秒**。10 次指数退避 = 最坏情况等 ~2 分钟。超过这个时间，问题大概率不是暂时的，继续等没意义。

---

## 所以呢

上下文管理是 Agent 开发里最容易被忽视的问题。大部分教程的 Agent 只跑 3-5 轮对话，永远不会触发上下文限制。但真实使用中，一个复杂任务轻松跑 20-30 轮。

我的设计总结：

| 层级 | 机制 | 触发条件 |
|------|------|---------|
| 预防 | 80% 阈值自动压缩 | inputTokens > limit × 0.8 |
| 选择 | 三种策略按场景选 | auto（默认）/ micro（轻量）/ manual（用户主动） |
| 兜底 | PTL 捕获 + 压缩重试 | API 报 prompt_too_long |
| 恢复 | 指数退避 + Full Jitter | API 暂时不可用 |

四层叠起来，Agent 可以无限对话下去——信息会逐渐丢失（这是物理限制），但永远不会崩溃。

> **上下文窗口不是"够大就行"的问题。200K token 也会满。你的 Agent 要么有压缩策略，要么在第 20 轮崩溃。没有第三种可能。**

代码：[code-agent/src/core/context](https://github.com/your-handle/code-agent/tree/main/src/core/context)。ContextManager + 三个 Compressor 加起来不到 200 行。

---

下一篇讲[记忆系统](./blog-ai-agent-memory-system.md)——上下文压缩丢掉的信息，怎么用跨 session 的记忆找回来。
