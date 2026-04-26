# Sub-Agent —— Agent 调用 Agent

## 概念

单个 agent 有局限：context window 有限，复杂任务容易混乱，长任务容易跑偏。

解法是**任务分解**：主 agent 把大任务拆成子任务，派发给专门的子 agent 执行，收集结果后汇总。

类比：项目经理（主 agent）把需求拆给前端工程师和后端工程师（子 agent），最后整合交付。

这种模式的好处：
- 每个子 agent 有独立的 context，不互相干扰
- 子任务可以并行执行，速度更快
- 主 agent 只关心协调，不关心细节
- 每个子 agent 可以有不同的工具集和权限

## 项目实现

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

## 动手练习

给主 agent 写一个 prompt，让它把任务分发给两个后台子 agent 并行执行：

```
你有 agent 工具和 send_message 工具。
请把以下任务分成两个子任务并行执行：
1. 子 agent A（run_in_background=true）：分析 src/core/agent/loop.ts，用 3 句话描述这个文件的职责
2. 子 agent B（run_in_background=true）：分析 src/core/tools/registry.ts，用 3 句话描述这个文件的职责
启动两个子 agent 后，用 send_message 分别收取结果，最后把两个结果合并成一份简短的架构说明。
```

运行 `bun run dev --ui` 在 TUI 界面里观察两个子 agent 的执行过程——你会看到它们的工具调用实时出现在界面上，且两个子 agent 的输出是交错的（因为它们在并行执行）。

---

> **English Summary:** `AgentTool` dispatches sub-agents via `AgentDispatcher`. `run_in_background=true` returns an agent ID immediately; `SendMessageTool` collects the result later — enabling true async parallel execution. Sub-agents communicate via stdout (JSON result) and stderr (diagnostics), keeping the channels clean. `createRestricted()` gives sub-agents a minimal tool subset following the principle of least privilege.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent) | Next: [Hooks System →](./09-hooks.md)
