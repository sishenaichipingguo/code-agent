// Tool registry and execution
import type { PermissionCapable, PermissionContext, PermissionResult, PermissionMatcher } from '@/core/permissions'
import { decide } from '@/core/permissions'
import type { HookManager } from '@/core/hooks/manager'

export interface Tool extends PermissionCapable {
  name: string
  description: string
  inputSchema: any
  execute(input: any): Promise<any>
}

/** Factory that fills in safe defaults for permission methods. */
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
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    execute: spec.execute,
    isConcurrencySafe: spec.isConcurrencySafe ?? (() => false),
    isReadOnly: spec.isReadOnly ?? (() => false),
    isDestructive: spec.isDestructive ?? (() => false),
    checkPermissions: spec.checkPermissions ?? (() => ({ type: 'ask', description: `Allow ${spec.name}?` })),
    preparePermissionMatcher: spec.preparePermissionMatcher ?? (() => null),
  }
}

export class ToolRegistry {
  private tools = new Map<string, Tool>()
  hooks?: HookManager

  register(tool: Tool) {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  async execute(name: string, input: any, ctx: PermissionContext): Promise<any> {
    const { AgentError, ErrorCode } = await import('@/infra/errors')

    const tool = this.tools.get(name)
    if (!tool) {
      throw new AgentError(ErrorCode.TOOL_NOT_FOUND, `Tool not found: ${name}`, { tool: name })
    }

    const decision = decide(tool, input, ctx, name)

    if (decision.type === 'deny') {
      throw new AgentError(ErrorCode.PERMISSION_DENIED, decision.reason, { tool: name })
    }

    if (decision.type === 'ask') {
      const confirmed = await this.promptUser(name, decision.description, input)
      if (!confirmed) {
        throw new AgentError(ErrorCode.PERMISSION_DENIED, 'User denied permission', { tool: name })
      }
    }

    const { getLogger } = await import('@/infra/logger')
    const { getConfig } = await import('@/core/config/loader')
    const { executeWithTimeout } = await import('@/infra/timeout')

    const logger = getLogger()
    const config = getConfig()
    const timeout = config.tools?.[name as keyof typeof config.tools]?.timeout || 30000

    const hookEnv: Record<string, string> = {
      AGENT_TOOL_NAME: name,
      AGENT_TOOL_INPUT: JSON.stringify(input)
    }

    try {
      logger.info('Tool execution started', { tool: name })

      // pre-tool: transform — may modify input; on_error: abort will throw and cancel execution
      let effectiveInput = input
      if (this.hooks) {
        const transformed = await this.hooks.transform('pre-tool', { name, input }, hookEnv)
        effectiveInput = transformed.input
      }

      const result = await executeWithTimeout(
        tool.execute(effectiveInput),
        timeout,
        new AgentError(ErrorCode.TIMEOUT, `Tool "${name}" timed out after ${timeout}ms`)
      )
      logger.info('Tool execution completed', { tool: name })

      // post-tool: notify — fire and forget, result already computed
      await this.hooks?.fire('post-tool', {
        ...hookEnv,
        AGENT_TOOL_RESULT: typeof result === 'string' ? result : JSON.stringify(result)
      })

      return result
    } catch (error: any) {
      logger.error('Tool execution failed', { tool: name, error: error.message })
      if (error instanceof AgentError) throw error
      throw new AgentError(
        ErrorCode.TOOL_EXECUTION_FAILED,
        error.message, { tool: name, input }, false
      )
    }
  }

  private async promptUser(toolName: string, description: string, input: any): Promise<boolean> {
    process.stderr.write(`\n⚠️  Permission required: ${toolName}\n`)
    process.stderr.write(`   ${description}\n`)
    const readline = await import('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
    return new Promise(resolve => {
      rl.question('Allow? (y/n) ', answer => {
        rl.close()
        resolve(answer.trim().toLowerCase() === 'y')
      })
    })
  }

  toSchema(): any[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema
    }))
  }

  createRestricted(allowedTools: string[]): ToolRegistry {
    const restricted = new ToolRegistry()
    for (const name of allowedTools) {
      const tool = this.tools.get(name)
      if (tool) restricted.register(tool)
    }
    return restricted
  }
}

export async function createToolRegistry(): Promise<ToolRegistry> {
  const registry = new ToolRegistry()

  // Register built-in tools
  const { BashTool } = await import('./bash')
  const { ReadTool } = await import('./read')
  const { WriteTool } = await import('./write')
  const { EditTool } = await import('./edit')
  const { GlobTool } = await import('./glob')
  const { GrepTool } = await import('./grep')
  const { LsTool } = await import('./ls')
  const { CpTool } = await import('./cp')
  const { MvTool } = await import('./mv')
  const { RmTool } = await import('./rm')
  const { TaskCreateTool, TaskUpdateTool, TaskListTool, TaskGetTool } = await import('./task')
  const { MemorySaveTool, MemoryLoadTool, MemoryUpdateTool, MemoryDeleteTool, MemoryTeamSaveTool } = await import('./memory')
  const { EnterPlanModeTool, ExitPlanModeTool } = await import('./plan')
  const { AgentTool, SendMessageTool } = await import('./agent')

  registry.register(BashTool)
  registry.register(ReadTool)
  registry.register(WriteTool)
  registry.register(EditTool)
  registry.register(GlobTool)
  registry.register(GrepTool)
  registry.register(LsTool)
  registry.register(CpTool)
  registry.register(MvTool)
  registry.register(RmTool)
  registry.register(new TaskCreateTool())
  registry.register(new TaskUpdateTool())
  registry.register(new TaskListTool())
  registry.register(new TaskGetTool())
  registry.register(new MemorySaveTool())
  registry.register(new MemoryLoadTool())
  registry.register(new MemoryUpdateTool())
  registry.register(new MemoryDeleteTool())
  registry.register(new MemoryTeamSaveTool())
  registry.register(new EnterPlanModeTool())
  registry.register(new ExitPlanModeTool())
  registry.register(new AgentTool())
  registry.register(new SendMessageTool())

  // Inject tools from configured MCP servers (if any)
  try {
    const { getConfig } = await import('@/core/config/loader')
    const { McpClientManager } = await import('@/core/mcp/client/manager')
    const config = getConfig()
    if (config.mcp?.servers && Object.keys(config.mcp.servers).length > 0) {
      const manager = new McpClientManager()
      await manager.loadTools(registry, config.mcp)
    }
  } catch {
    // Config not yet initialized or MCP not configured — skip silently
  }

  return registry
}
