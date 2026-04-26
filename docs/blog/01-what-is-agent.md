# 什么是 AI Agent？和普通 LLM 调用有什么区别

## 一、问题背景：LLM 能思考，但不能行动

2022 年底 ChatGPT 发布后，很多人的第一反应是：这东西能回答问题，但能不能帮我干活？

"干活"和"回答问题"有本质区别。回答问题是无状态的——你问，它答，结束。干活是有状态的——需要读文件、写代码、运行测试、根据结果调整、再运行……是一个持续的过程。

LLM 本身做不到这件事，原因很根本：**模型是无状态的函数**。每次调用都是独立的，输入 tokens，输出 tokens，没有副作用，没有持久状态。它不能"主动"打开文件，不能"主动"运行命令，不能"记住"上次做了什么。

早期的解法是让模型输出结构化文本，然后人工或脚本解析执行。比如让模型输出：

```
ACTION: read_file
PATH: src/main.ts
```

然后你的代码解析这段文本，执行读文件操作，把结果拼回 prompt，再调用模型。这能用，但很脆弱——模型输出格式稍微变一下，解析就崩了。

2023 年 OpenAI 引入 Function Calling，把这个流程标准化了：模型不再输出自由文本，而是输出结构化的工具调用请求，格式由 API 保证。这是 agent 系统真正可靠的起点。

## 二、核心矛盾：自主性 vs 可控性

Agent 的核心矛盾是：**你希望它足够自主，能独立完成复杂任务；但你又希望它足够可控，不会做出你不想要的事。**

这个矛盾没有完美解法，只有权衡。自主性越高，出错的代价越大；可控性越强，能完成的任务越受限。

这个矛盾贯穿 agent 系统的每一个设计决策：
- 权限模型（第 3 篇）：给 agent 多大的操作权限？
- 上下文压缩（第 5 篇）：压缩历史时，agent 会"忘记"什么？
- Sub-agent（第 8 篇）：把任务分给子 agent，如何保证子 agent 不越权？

理解这个矛盾，是理解 agent 系统所有设计决策的前提。

## 三、ReAct：让 LLM 进入循环

2022 年 Google 的论文《ReAct: Synergizing Reasoning and Acting in Language Models》提出了一个简单但有效的框架：让模型交替进行**推理（Reason）**和**行动（Act）**。

在 ReAct 之前，有两条路：
- **Chain-of-Thought（CoT）**：让模型一步步推理，但只是思考，不能行动
- **直接行动**：让模型输出操作，但没有推理过程，容易出错

ReAct 把两者结合：模型先思考"我需要做什么"，然后行动，观察结果，再思考，再行动……

```
思考：我需要知道这个函数的定义，应该先搜索文件
行动：grep("function processPayment", "src/")
观察：找到了 src/payment/processor.ts:42
思考：找到了，现在读这个文件
行动：read("src/payment/processor.ts")
观察：[文件内容...]
思考：我现在理解了这个函数，可以回答问题了
回答：这个函数负责...
```

这个循环就是 agent 的核心。它不是什么神秘的东西，本质上就是：**把模型的输出作为下一轮的输入，反复迭代，直到任务完成。**

## 四、循环的控制流

循环的关键问题是：**什么时候停？**

模型的每次响应只有三种类型：

```
响应类型
├── text      → 模型认为任务完成，返回最终答案 → 退出循环
├── tool_use  → 模型要调用工具 → 执行工具，把结果塞回消息列表 → 继续循环
└── error     → 出错了 → 退出循环
```

模型永远不会"主动停下来"——它只是在某一轮选择了返回 `text` 而不是 `tool_use`。这意味着：**循环能不能正常结束，取决于模型的判断能力。**

如果模型判断失误（比如认为任务完成了但其实没有，或者陷入了"调用工具 → 结果不满意 → 再调用 → 还是不满意"的死循环），循环就会出问题。这是 agent 可靠性的核心挑战之一。

实际系统里通常会加一个 turn 计数器作为保险：超过最大轮数就强制退出，避免无限循环消耗 token。

## 五、Agent 的核心挑战

在你开始构建 agent 之前，需要了解它的局限性：

**规划能力的局限**：模型擅长局部推理，但对于需要长期规划的任务（比如"重构整个代码库"），它很容易在中途迷失方向，忘记最初的目标。

**工具选择的不确定性**：同样的任务，模型可能选择不同的工具组合，结果也可能不同。这种不确定性在生产环境里很难处理。

**错误恢复能力有限**：工具调用失败时，模型有时能优雅地换一种方式重试，有时会陷入困惑，反复尝试同样的错误操作。

**幻觉问题**：模型可能"假装"调用了工具，或者对工具返回的结果做出错误的解读。

**成本问题**：每一轮循环都要调用 API，一个复杂任务可能需要几十轮，成本不可忽视。

这些不是"bug"，是当前 LLM 技术的固有局限。理解这些局限，才能设计出合理的 agent 系统——知道什么任务适合用 agent，什么任务不适合。

**什么时候不应该用 agent：**
- 任务有确定性答案，不需要多步推理（直接调用 LLM 更快更便宜）
- 任务对可靠性要求极高，不能容忍任何错误（agent 的不确定性太高）
- 任务步骤完全固定，不需要动态决策（写死的脚本更可靠）

## 六、项目实现

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

`AgentContext` 不只是"配置"，它是 agent 的完整运行环境。注意每个字段都是可选的——这是渐进式设计：你可以只传 `model` 和 `tools` 跑一个最简单的 agent，之后按需加入压缩、记忆、hooks 等能力，不需要一次性配置所有东西。

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

    while (true) {
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

注意工具结果是以 `user` 角色塞回消息列表的——这是 Anthropic API 的约定，`tool_result` 类型的消息必须放在 `user` 轮里。这个约定初看有点奇怪（工具结果为什么是"用户"说的？），但从 API 设计角度看，消息列表只有 `user` 和 `assistant` 两种角色，工具结果是"外部世界的反馈"，归入 `user` 侧是合理的。

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

streaming 路径还内置了 **Full Jitter 指数退避重试**：遇到可恢复的错误（如网络抖动、限流），会自动等待后重试，最多 10 次，等待时间随机化以避免多个 agent 同时重试造成雪崩：

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

读文件、搜索代码这类操作都是并发安全的，模型同时要读 5 个文件时不需要等第一个读完再读第二个。这个优化在实际使用中效果显著——一个需要读取多个文件的分析任务，并行执行可以快 3-5 倍。

## 七、边界条件和陷阱

**无限循环**：模型可能陷入"调用工具 → 结果不满意 → 再调用同一个工具 → 还是不满意"的死循环。实际系统里需要设置最大 turn 数（比如 50），超过就强制退出并告知用户。

**工具结果太大**：如果工具返回了几万行的文件内容，会迅速撑爆 context window。工具实现里需要对结果做截断，或者让模型先搜索再精确读取，而不是直接读整个文件。

**模型"假装"完成**：有时模型会在任务没有真正完成时返回 `text` 类型的响应，假装任务完成了。这在复杂任务里很常见，需要在 prompt 里明确要求模型"在确认任务完成前，先验证结果"。

**错误恢复的不一致性**：同样的工具调用失败，模型有时能优雅地换一种方式重试，有时会陷入困惑。这种不一致性很难在系统层面完全解决，只能通过好的工具错误信息（让模型知道为什么失败、应该怎么修正）来缓解。

## 八、在整个系统里的位置

`AgentLoop` 是整个系统的核心，其他所有组件都是它的依赖：

```
AgentLoop
├── ModelAdapter      → 第 7 篇：多模型支持
├── ToolRegistry      → 第 2 篇：工具系统
├── PermissionContext → 第 3 篇：权限模型
├── SystemPrompt      → 第 4 篇：System Prompt 工程
├── ContextManager    → 第 5 篇：上下文压缩
├── MemoryManager     → 第 6 篇：记忆系统
├── HookManager       → 第 9 篇：Hooks 系统
└── AgentTool         → 第 8 篇：Sub-Agent
```

理解了 `AgentLoop` 的结构，后面每一篇都是在讲"这个依赖是怎么实现的，为什么这样设计"。

## 九、动手练习

**练习 1：观察循环**

在 `src/cli/yolo.ts` 里给 agent 加上 `onChunk` 回调，实时打印每次工具调用的名称和耗时：

```typescript
const loop = new AgentLoop({
  // ...其他配置
  onChunk: (chunk) => {
    if (chunk.type === 'tool_start') {
      process.stderr.write(`\n→ [turn ${chunk.turn}] ${chunk.name}\n`)
    }
    if (chunk.type === 'tool_end') {
      process.stderr.write(`← ${chunk.name} 完成，耗时 ${chunk.duration}ms\n`)
    }
  }
})
```

运行 `bun run dev "帮我分析 src/ 下有哪些文件，每个文件的职责是什么"` 观察循环的运行过程。注意：模型会先用 glob 列出文件，再并行读取多个文件，最后汇总——这个过程在日志里清晰可见。

**练习 2：理解并行执行**

把 `isConcurrencySafe` 全部改成 `() => false`（在 `src/core/tools/read.ts` 等文件里），再跑同样的任务，对比耗时。你会看到原本并行的文件读取变成了串行，总时间大幅增加。改回来，理解这个优化的价值。

**练习 3：触发边界条件**

给 agent 一个会导致工具调用失败的任务（比如读一个不存在的文件），观察模型如何处理错误：它会重试吗？会换一种方式吗？还是直接放弃？这个实验能让你直观感受到 agent 错误恢复能力的局限性。

---

> **English Summary:** An Agent is an LLM in a loop (ReAct pattern) — it reasons, acts (calls tools), observes results, and repeats until done. The core tension is autonomy vs. controllability. `AgentLoop` in `src/core/agent/loop.ts` has two execution paths (streaming/non-streaming), Full Jitter retry, and parallel tool execution for concurrency-safe tools. Key challenges: infinite loops, oversized tool results, model hallucinating completion, and inconsistent error recovery.
>
> ⭐ Next: [Tool Use →](./02-tool-use.md)
