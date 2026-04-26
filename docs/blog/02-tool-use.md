# Tool Use —— Agent 的手和眼

## 概念

模型本身只能输出文字。它怎么"执行"操作？

答案是 **Function Calling**：你告诉模型"有这些工具可以用"，模型在回复里说"我要调用 X 工具，参数是 Y"，然后你的代码真正去执行，把结果再告诉模型。

模型从来不直接执行代码——它只是"声明意图"，执行权在你手里。

工具定义长这样：

```json
{
  "name": "read_file",
  "description": "读取文件内容",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    }
  }
}
```

模型看到这个描述，就知道什么时候该用它、该传什么参数。description 写得越清楚，模型用得越准确——这是工具设计里最重要的一件事。

## 项目实现

### Tool 接口

`src/core/tools/registry.ts` 定义了 `Tool` 接口：

```typescript
export interface Tool {
  name: string
  description: string
  inputSchema: any
  execute(input: any): Promise<any>

  // 权限相关
  isConcurrencySafe(input: unknown): boolean  // 可以和其他工具并行执行吗？
  isReadOnly(input: unknown): boolean          // 不修改任何状态吗？
  isDestructive(input: unknown): boolean       // 有破坏性吗（删除、覆盖）？
  checkPermissions(input: unknown, ctx: PermissionContext): PermissionResult
  preparePermissionMatcher(input: unknown): PermissionMatcher | null
}
```

注意 `isConcurrencySafe` 和 `isReadOnly` 是两个不同的概念：
- `isReadOnly`：用于权限判断，表示工具不修改任何状态
- `isConcurrencySafe`：用于调度优化，表示工具可以和其他工具同时执行

一个工具可以是只读但不并发安全（比如读取一个会被其他工具修改的临时文件）。`AgentLoop` 用 `isConcurrencySafe` 决定是否并行，不是 `isReadOnly`。

`createTool` 工厂函数帮你填好所有权限方法的默认值：

```typescript
export function createTool(spec: {
  name: string
  description: string
  inputSchema: any
  execute(input: any): Promise<any>
  isConcurrencySafe?: (input: unknown) => boolean
  isReadOnly?: (input: unknown) => boolean
  isDestructive?: (input: unknown) => boolean
  checkPermissions?: (input: unknown, ctx: PermissionContext) => PermissionResult
  preparePermissionMatcher?: (input: unknown) => PermissionMatcher | null
}): Tool {
  return {
    ...spec,
    isConcurrencySafe: spec.isConcurrencySafe ?? (() => false),
    isReadOnly: spec.isReadOnly ?? (() => false),
    isDestructive: spec.isDestructive ?? (() => false),
    // 默认：需要询问用户
    checkPermissions: spec.checkPermissions ?? (() => ({ type: 'ask', description: `Allow ${spec.name}?` })),
    preparePermissionMatcher: spec.preparePermissionMatcher ?? (() => null),
  }
}
```

### 工具执行的完整流程

`ToolRegistry.execute()` 不只是调用 `tool.execute()`，它是一个完整的执行管道：

```
权限检查 → pre-tool hook（可修改输入）→ 超时包装执行 → post-tool hook（通知）
```

```typescript
async execute(name: string, input: any, ctx: PermissionContext): Promise<any> {
  const tool = this.tools.get(name)

  // 1. 权限检查
  const decision = decide(tool, input, ctx, name)
  if (decision.type === 'deny') throw new AgentError(PERMISSION_DENIED, ...)
  if (decision.type === 'ask') {
    const confirmed = await this.promptUser(name, decision.description, input)
    if (!confirmed) throw new AgentError(PERMISSION_DENIED, 'User denied')
  }

  // 2. pre-tool hook：可以修改传入参数
  let effectiveInput = input
  if (this.hooks) {
    const transformed = await this.hooks.transform('pre-tool', { name, input }, hookEnv)
    effectiveInput = transformed.input
  }

  // 3. 超时包装执行（默认 30s，可在 .agent.yml 里配置）
  const timeout = config.tools?.[name]?.timeout || 30000
  const result = await executeWithTimeout(tool.execute(effectiveInput), timeout, timeoutError)

  // 4. post-tool hook：通知（不能修改结果）
  await this.hooks?.fire('post-tool', {
    AGENT_TOOL_NAME: name,
    AGENT_TOOL_RESULT: JSON.stringify(result)
  })

  return result
}
```

`pre-tool` 是 `transform` 类型的 hook，可以修改工具的输入参数。`post-tool` 是 `fire` 类型，只是通知，不能改结果。这个区别很重要——下一篇 Hooks 系统会详细讲。

### MCP 工具注入

`createToolRegistry()` 在注册完所有内置工具后，还会自动从配置的 MCP server 加载工具：

```typescript
export async function createToolRegistry(): Promise<ToolRegistry> {
  const registry = new ToolRegistry()

  // 注册内置工具：bash, read, write, edit, glob, grep, ls, cp, mv, rm,
  // task (CRUD), memory, plan, agent, send_message
  registry.register(BashTool)
  // ...

  // 从 MCP server 加载额外工具
  const config = getConfig()
  if (config.mcp?.servers && Object.keys(config.mcp.servers).length > 0) {
    const manager = new McpClientManager()
    await manager.loadTools(registry, config.mcp)
  }

  return registry
}
```

在 `.agent.yml` 里配置 MCP server，agent 启动时就能用上那些工具，不需要改任何代码：

```yaml
mcp:
  servers:
    filesystem:
      command: npx
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
```

### 受限工具注册表

`ToolRegistry` 还有一个 `createRestricted()` 方法，用于给子 agent 创建只包含部分工具的注册表：

```typescript
createRestricted(allowedTools: string[]): ToolRegistry {
  const restricted = new ToolRegistry()
  for (const name of allowedTools) {
    const tool = this.tools.get(name)
    if (tool) restricted.register(tool)
  }
  restricted.hooks = this.hooks  // hooks 继承
  return restricted
}
```

子 agent 只拿到它需要的工具，不能调用主 agent 的全部工具集。这是最小权限原则在工具层的体现。

## 动手练习

在 `src/core/tools/` 下新建 `get-time.ts`，注册一个返回当前时间的工具，并给它加上 `pre-tool` hook 的支持（通过 `isConcurrencySafe` 标记它可以并行）：

```typescript
import { createTool } from './registry'

export const getTimeTool = createTool({
  name: 'get_time',
  description: '获取当前的本地时间，可选择时区',
  inputSchema: {
    type: 'object',
    properties: {
      timezone: { type: 'string', description: '时区，如 Asia/Shanghai，默认本地时区' }
    }
  },
  isConcurrencySafe: () => true,   // 只读且无副作用，可以并行
  isReadOnly: () => true,
  checkPermissions: () => ({ type: 'allow' }),  // 不需要权限确认
  execute: async ({ timezone }) => {
    const options: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }
    return new Intl.DateTimeFormat('zh-CN', options).format(new Date())
  }
})
```

然后在 `createToolRegistry()` 里注册它，运行 `bun run dev "现在北京和纽约分别几点？"` 观察模型是否会并行调用两次 `get_time`（一次传 `Asia/Shanghai`，一次传 `America/New_York`）。

---

> **English Summary:** Tool Use (Function Calling) is how agents act on the world. The model declares intent; your code executes. `ToolRegistry` in `src/core/tools/registry.ts` runs a full pipeline: permission check → pre-tool hook (can modify input) → timeout-wrapped execution → post-tool hook (notify). `isConcurrencySafe` (scheduling) and `isReadOnly` (permissions) are distinct concepts. MCP tools are auto-injected at startup from `.agent.yml` config.
>
> ⭐ [GitHub: code-agent](https://github.com/your-repo/code-agent) | Next: [Permission Model →](./03-permissions.md)
