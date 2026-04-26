# 权限模型 —— YOLO vs Safe Mode

## 概念

Agent 能执行 bash 命令、删除文件、写代码——这些操作如果出错，代价很高。

两种极端：
- **完全信任**：agent 想干什么就干什么，速度最快，风险最高
- **每步确认**：每个操作都问用户，最安全，但极其烦人

这个项目的解法是两种模式并存，让用户自己选：
- **YOLO 模式**（`bypass`）：零权限检查，适合你信任 agent 的场景（本地开发、测试）
- **Safe 模式**（默认）：写文件、执行 bash、删除前都会提示用户确认
- **Auto 模式**：所有需要确认的操作直接 deny，适合 CI/CD 等无人值守场景

信任边界的核心问题是：**谁来决定这个操作能不能执行？** YOLO 是"agent 决定"，Safe 是"用户决定"，Auto 是"提前配置好规则决定"。

## 项目实现

### decide() 的决策逻辑

权限决策的核心在 `src/core/permissions/engine.ts` 的 `decide()` 函数：

```typescript
export function decide(
  tool: PermissionCapable,
  input: unknown,
  ctx: PermissionContext,
  toolName = ''
): PermissionResult {
  // 1. bypass 模式（YOLO）：直接放行
  if (ctx.mode === 'bypass') return { type: 'allow' }

  // 2. 工具自己说"deny"：直接拒绝，不管模式
  const toolResult = tool.checkPermissions(input, ctx)
  if (toolResult.type === 'deny') return toolResult

  // 3. 有匹配的预批准规则：放行
  const matched = ctx.allowRules.some(rule => matchesRule(rule, toolName, input))
  if (matched) return { type: 'allow' }

  // 4. 工具自己说"allow"：放行
  if (toolResult.type === 'allow') return { type: 'allow' }

  // 5. auto 模式：需要确认的操作直接 deny
  if (ctx.mode === 'auto') {
    return { type: 'deny', reason: 'auto mode: operation requires confirmation — add an allow rule' }
  }

  // 6. 默认：返回工具的建议（通常是 ask）
  return toolResult
}
```

这个决策树有几个值得注意的地方：

**工具的 deny 优先级最高**——即使在 YOLO 模式下，如果工具自己返回 `deny`，也会被拒绝。这是工具层的硬性防护，不受权限模式影响。

**`allowRules` 是预批准机制**——你可以提前告诉 agent "所有对 `src/` 目录的读操作都允许"，这样就不需要每次都问。`preparePermissionMatcher` 方法让工具声明自己的操作可以被哪类规则匹配。

**auto 模式专为无人值守设计**——在 CI/CD 里跑 agent 时，没有人能回答"是否允许"，所以 auto 模式把所有需要确认的操作都变成 deny，只有明确在 `allowRules` 里的操作才能执行。

### ToolRegistry 里的执行流程

```typescript
// src/core/tools/registry.ts
const decision = decide(tool, input, ctx, name)

if (decision.type === 'deny') {
  throw new AgentError(ErrorCode.PERMISSION_DENIED, decision.reason)
}

if (decision.type === 'ask') {
  const confirmed = await this.promptUser(name, decision.description, input)
  if (!confirmed) throw new AgentError(ErrorCode.PERMISSION_DENIED, 'User denied')
}
// decision.type === 'allow' → 直接执行
```

### 为什么 promptUser 走 stderr

```typescript
private async promptUser(toolName: string, description: string, input: any): Promise<boolean> {
  process.stderr.write(`\n⚠️  Permission required: ${toolName}\n`)
  process.stderr.write(`   ${description}\n`)
  // ...等待用户输入
}
```

权限提示走 `stderr` 而不是 `stdout`，原因是：这个项目支持子 agent 模式，子 agent 的最终结果通过 `stdout` 以 JSON 格式传给主 agent。如果权限提示混进 `stdout`，主 agent 解析 JSON 时就会出错。`stderr` 是"诊断输出"，`stdout` 是"数据输出"——这个约定贯穿整个项目。

### createRestricted() 给子 agent 限权

```typescript
createRestricted(allowedTools: string[]): ToolRegistry {
  const restricted = new ToolRegistry()
  for (const name of allowedTools) {
    const tool = this.tools.get(name)
    if (tool) restricted.register(tool)
  }
  restricted.hooks = this.hooks  // hooks 继承给子注册表
  return restricted
}
```

子 agent 只拿到它需要的工具子集。比如一个只负责读代码的分析 agent，只需要 `read`、`glob`、`grep`，不需要 `bash`、`write`、`rm`。最小权限原则在工具层的直接体现。

## 动手练习

给 bash 工具加一个关键词黑名单，这个黑名单在所有权限模式下都生效（因为它在工具层，不依赖权限模式）。找到 `src/core/tools/bash.ts`，在 `checkPermissions` 里加检查：

```typescript
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,      // 删除根目录
  /mkfs/,               // 格式化磁盘
  /dd\s+if=\/dev\/zero/ // 覆写磁盘
]

checkPermissions: (input: { command: string }, ctx) => {
  const blocked = BLOCKED_PATTERNS.find(p => p.test(input.command))
  if (blocked) {
    return {
      type: 'deny',
      reason: `命令被拦截：匹配危险模式 ${blocked}`
    }
  }
  // 不在黑名单里，走正常权限流程
  return { type: 'ask', description: `执行命令: ${input.command}` }
}
```

注意这里用正则而不是字符串匹配，因为 `rm  -rf /`（多个空格）也应该被拦截。

---

> **English Summary:** The permission engine in `src/core/permissions/engine.ts` has four modes: bypass (YOLO), default (ask user), auto (deny anything needing confirmation — for CI/CD), and tool-level deny (always blocks regardless of mode). `allowRules` enable pre-approving classes of operations. `promptUser()` writes to stderr to avoid polluting the stdout JSON channel used by sub-agents.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent) | Next: [System Prompt →](./04-system-prompt.md)
