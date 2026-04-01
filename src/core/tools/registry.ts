// Tool registry and execution
export interface Tool {
  name: string
  description: string
  inputSchema: any
  readonly?: boolean  // true = no side effects, safe to run in parallel
  execute(input: any): Promise<any>
}

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool) {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  async execute(name: string, input: any, mode: 'yolo' | 'safe'): Promise<any> {
    const tool = this.tools.get(name)
    if (!tool) {
      const { AgentError, ErrorCode } = await import('@/infra/errors')
      throw new AgentError(ErrorCode.TOOL_NOT_FOUND, `Tool not found: ${name}`, { tool: name })
    }

    // Safe mode: check permissions
    if (mode === 'safe' && this.requiresConfirmation(name)) {
      const confirmed = await this.askPermission(name, input)
      if (!confirmed) {
        const { AgentError, ErrorCode } = await import('@/infra/errors')
        throw new AgentError(ErrorCode.PERMISSION_DENIED, 'Permission denied', { tool: name })
      }
    }

    const { getLogger } = await import('@/infra/logger')
    const { getConfig } = await import('@/core/config/loader')
    const { executeWithTimeout } = await import('@/infra/timeout')
    const { AgentError, ErrorCode } = await import('@/infra/errors')

    const logger = getLogger()
    const config = getConfig()

    // Get tool timeout from config
    const timeout = config.tools?.[name as keyof typeof config.tools]?.timeout || 30000

    try {
      logger.info('Tool execution started', { tool: name })

      const result = await executeWithTimeout(
        tool.execute(input),
        timeout,
        new AgentError(
          ErrorCode.TIMEOUT,
          `Tool "${name}" timed out after ${timeout}ms`
        )
      )

      logger.info('Tool execution completed', { tool: name })
      return result
    } catch (error: any) {
      logger.error('Tool execution failed', { tool: name, error: error.message })

      if (error instanceof AgentError) {
        throw error
      }

      throw new AgentError(
        ErrorCode.TOOL_EXECUTION_FAILED,
        error.message,
        { tool: name, input },
        false
      )
    }
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

  private requiresConfirmation(name: string): boolean {
    return ['write', 'edit', 'bash', 'rm', 'mv'].includes(name)
  }

  private async askPermission(name: string, input: any): Promise<boolean> {
    console.log(`\nPermission required: ${name}`)
    console.log('Input:', JSON.stringify(input, null, 2))
    const readline = await import('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    return new Promise(resolve => {
      rl.question('Allow? (y/n) ', answer => {
        rl.close()
        resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes')
      })
    })
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
  const { MemorySaveTool, MemoryLoadTool } = await import('./memory')
  const { EnterPlanModeTool, ExitPlanModeTool } = await import('./plan')
  const { AgentTool, SendMessageTool } = await import('./agent')

  registry.register(new BashTool())
  registry.register(new ReadTool())
  registry.register(new WriteTool())
  registry.register(new EditTool())
  registry.register(new GlobTool())
  registry.register(new GrepTool())
  registry.register(new LsTool())
  registry.register(new CpTool())
  registry.register(new MvTool())
  registry.register(new RmTool())
  registry.register(new TaskCreateTool())
  registry.register(new TaskUpdateTool())
  registry.register(new TaskListTool())
  registry.register(new TaskGetTool())
  registry.register(new MemorySaveTool())
  registry.register(new MemoryLoadTool())
  registry.register(new EnterPlanModeTool())
  registry.register(new ExitPlanModeTool())
  registry.register(new AgentTool())
  registry.register(new SendMessageTool())

  return registry
}
