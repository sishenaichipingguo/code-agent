# Sub-Agent —— Agent 调用 Agent

## 一、问题背景：单个 Agent 的局限

单个 agent 有几个根本性的局限：

**Context window 有限**：复杂任务需要大量上下文，但 context window 有上限。一个需要分析整个代码库的任务，可能需要的上下文远超单个 agent 能处理的范围。

**任务容易混乱**：当一个 agent 同时处理多个子任务时，不同子任务的上下文会互相干扰。agent 可能在处理子任务 A 时，被子任务 B 的上下文"污染"，导致错误。

**无法并行**：单个 agent 是串行的——它必须完成一个工具调用才能开始下一个。如果两个子任务互相独立，串行执行会浪费时间。

**工具权限难以细化**：主 agent 可能有很多工具（包括危险的工具如 `bash`、`rm`），但某些子任务只需要读取权限。给子任务完整的工具集是不必要的风险。

解法是**任务分解**：主 agent 把大任务拆成子任务，派发给专门的子 agent 执行，收集结果后汇总。

类比：项目经理（主 agent）把需求拆给前端工程师和后端工程师（子 agent），最后整合交付。

## 二、核心矛盾：隔离 vs 通信

Sub-agent 模式的核心矛盾是：**你希望子 agent 完全隔离（避免干扰），但又需要它们能和主 agent 通信（传递结果）。**

这个矛盾有几个维度：

**进程隔离 vs 数据共享**：子 agent 作为独立进程运行，有完全隔离的内存空间。但主 agent 需要获取子 agent 的结果。如何在进程边界传递数据？

**同步 vs 异步**：主 agent 等待子 agent 完成（同步）会阻塞主 agent；不等待（异步）需要额外的机制来收取结果。

**权限继承 vs 权限隔离**：子 agent 应该继承主 agent 的所有权限，还是只有最小权限？继承更方便，但违反最小权限原则。

## 三、设计空间：子 agent 的协调模式

子 agent 可以用几种不同的方式协调：

**Fan-out / Fan-in（扇出/扇入）**：主 agent 把任务分发给多个子 agent（扇出），等所有子 agent 完成后汇总结果（扇入）。适合可以并行的独立子任务。

**Pipeline（流水线）**：子 agent A 的输出是子 agent B 的输入，形成流水线。适合有依赖关系的顺序任务。

**DAG（有向无环图）**：更复杂的依赖关系，某些子 agent 需要等待多个前置子 agent 完成。适合复杂的工作流。

**Recursive（递归）**：子 agent 可以再派发子子 agent，形成树状结构。适合需要递归分解的任务（比如分析一个大型代码库）。

这个项目实现了 Fan-out / Fan-in 模式，通过 `run_in_background=true` 和 `SendMessageTool` 实现异步并行。

## 四、项目实现

### AgentTool：启动子 agent

`AgentTool` 通过 `AgentDispatcher` 启动子 agent：

```typescript
export class AgentTool implements Tool {
  name = 'agent'
  description = 'Invoke a specialized sub-agent to handle a complex task in an isolated process'
  inputSchema = {
    properties: {
      subagent_type: {
        enum: ['general-purpose', 'explore', 'plan', 'context-gatherer']
      },
      description: { type: 'string' },
      prompt: { type: 'string' },
      run_in_background: { type: 'boolean' }  // 后台运行，立即返回 agent ID
    }
  }

  async execute(input: AgentInput): Promise<string> {
    const result = await dispatcher.dispatch(
      input.subagent_type,
      input.prompt,
      { background: input.run_in_background }
    )

    if (result.status === 'running') {
      // 后台运行：返回 agent ID，主 agent 可以继续做其他事
      return `SubAgent started in background. ID: ${result.agentId}\nUse send_message tool with to: "${result.agentId}" to get the result.`
    }
    return result.result ?? 'SubAgent completed with no output'
  }
}
```

### SendMessageTool：收取后台子 agent 的结果

`AgentTool` 有一个配套工具 `SendMessageTool`，用于收取后台运行的子 agent 的结果：

```typescript
export class SendMessageTool implements Tool {
  name = 'send_message'
  description = 'Get the result from a background sub-agent by its agent ID'

  async execute(input: { to: string }): Promise<string> {
    const result = await dispatcher.getResult(input.to)
    if (result === null) {
      return `Agent ${input.to} not found. It may have already been collected or the ID is incorrect.`
    }
    return result
  }
}
```

这两个工具配合使用，实现了**异步并行**的子 agent 模式：

```
主 agent：
  → agent(task_A, run_in_background=true) → 返回 ID_A
  → agent(task_B, run_in_background=true) → 返回 ID_B
  → agent(task_C, run_in_background=true) → 返回 ID_C
  → send_message(to=ID_A) → 等待 A 的结果
  → send_message(to=ID_B) → 等待 B 的结果
  → send_message(to=ID_C) → 等待 C 的结果
  → 汇总三个结果
```

### stderr/stdout 分离：为什么这么设计

子 agent 和主 agent 通过进程通信。子 agent 的最终结果通过 `stdout` 以 JSON 格式输出，主 agent 解析这个 JSON。

但子 agent 在运行过程中会产生大量诊断输出（工具调用日志、进度信息、错误信息）。这些输出必须走 `stderr`，不能混进 `stdout`：

```typescript
// src/core/agent/runner.ts（子 agent 入口）
// 诊断输出 → stderr（不影响主 agent 解析）
process.stderr.write(`Tool: ${toolName}\n`)

// 最终结果 → stdout（主 agent 解析这个）
process.stdout.write(JSON.stringify({ result: finalText }))
```

这个约定贯穿整个项目：`AgentLoop` 里所有的进度输出都走 `stderr`，只有最终答案走 `stdout`。

为什么不用其他通信方式（比如 IPC、共享内存）？因为进程间通过 stdout/stderr 通信是最简单、最通用的方式——不需要额外的依赖，任何语言都支持，而且天然支持流式输出。

### createRestricted()：给子 agent 最小权限

子 agent 不需要主 agent 的全部工具。一个只负责分析代码的子 agent，只需要 `read`、`glob`、`grep`，不需要 `bash`、`write`、`rm`：

```typescript
// 创建只有读取工具的受限注册表
const readOnlyRegistry = registry.createRestricted(['read', 'glob', 'grep', 'ls'])

// 子 agent 用这个受限注册表初始化
const subAgentLoop = new AgentLoop({
  ...context,
  tools: readOnlyRegistry  // 只能用这三个工具
})
```

`createRestricted()` 创建的受限注册表会继承原注册表的 hooks，所以 `pre-tool`、`post-tool` 等 hooks 在子 agent 里同样生效。

这是**最小权限原则（Principle of Least Privilege）**的体现：每个组件只拥有完成其任务所需的最小权限。这减少了出错时的影响范围——即使子 agent 被恶意 prompt 控制，它也无法执行危险操作。

## 五、边界条件和陷阱

**子 agent 的错误处理**：如果子 agent 崩溃或超时，主 agent 需要能检测到并处理。`AgentDispatcher` 会捕获子进程的退出码，把错误信息作为结果返回给主 agent。

**结果大小限制**：子 agent 的结果通过 stdout 传递，如果结果太大（比如分析了一个巨大的代码库），可能会超过进程通信的缓冲区限制。需要在子 agent 里对结果进行截断或摘要。

**并行度控制**：如果主 agent 同时启动太多子 agent，可能会耗尽系统资源（内存、CPU、API 并发限制）。`AgentDispatcher` 需要有并发度控制。

**循环调用**：子 agent 可以再派发子子 agent，但如果没有深度限制，可能会形成无限递归。需要在 `AgentDispatcher` 里限制最大嵌套深度。

**记忆隔离的副作用**：子 agent 通过 `MEMORY_NAMESPACE` 隔离记忆，但这意味着子 agent 无法访问主 agent 的个人记忆（只能看到索引）。如果子 agent 需要用户偏好信息，需要在 prompt 里显式传递。

## 六、与其他组件的关系

Sub-agent 和记忆系统（第 6 篇）通过 `MEMORY_NAMESPACE` 协作：子 agent 有独立的记忆命名空间，避免污染主 agent 的记忆。

Sub-agent 和 hooks 系统（第 9 篇）有继承关系：`createRestricted()` 创建的受限注册表继承了原注册表的 hooks，所以 hooks 在子 agent 里同样生效。

Sub-agent 和权限模型（第 3 篇）紧密相关：子 agent 的工具集通过 `createRestricted()` 限制，这是权限模型在子 agent 场景的应用。

Sub-agent 和多模型支持（第 7 篇）可以结合：不同的子 agent 可以使用不同的模型——主 agent 用 Claude Opus 做协调，子 agent 用 Haiku 做具体执行，降低成本。

## 七、动手练习

**练习 1：并行执行两个子任务**

给主 agent 写一个 prompt，让它把任务分发给两个后台子 agent 并行执行：

```
你有 agent 工具和 send_message 工具。
请把以下任务分成两个子任务并行执行：
1. 子 agent A（run_in_background=true）：分析 src/core/agent/loop.ts，用 3 句话描述这个文件的职责
2. 子 agent B（run_in_background=true）：分析 src/core/tools/registry.ts，用 3 句话描述这个文件的职责
启动两个子 agent 后，用 send_message 分别收取结果，最后把两个结果合并成一份简短的架构说明。
```

运行 `bun run dev --ui` 在 TUI 界面里观察两个子 agent 的执行过程——你会看到它们的工具调用实时出现在界面上，且两个子 agent 的输出是交错的（因为它们在并行执行）。

**练习 2：观察权限隔离**

修改 `AgentDispatcher`，让子 agent 只有 `read` 和 `glob` 工具，然后让主 agent 派发一个需要 `bash` 工具的子任务。观察子 agent 如何处理它没有权限的工具调用——它会报错，还是会尝试用其他方式完成任务？

**练习 3：测试错误传播**

故意让子 agent 的任务失败（比如让它读取一个不存在的文件），观察主 agent 如何处理子 agent 的错误——它会重试，还是会继续执行其他子任务？

**练习 4：预测并行 vs 串行的性能差异**

给主 agent 三个独立的分析任务，先用串行方式（一个接一个）执行，再用并行方式（`run_in_background=true`）执行，对比总耗时。这能让你直观感受到并行执行的性能优势。

---

> **English Summary:** `AgentTool` dispatches sub-agents via `AgentDispatcher`. `run_in_background=true` returns an agent ID immediately; `SendMessageTool` collects the result later — enabling true async parallel execution. Sub-agents communicate via stdout (JSON result) and stderr (diagnostics), keeping the channels clean. `createRestricted()` gives sub-agents a minimal tool subset following the principle of least privilege.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent) | Next: [Hooks System →](./09-hooks.md)
