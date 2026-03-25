// Tool registry and execution
export interface Tool {
  name: string
  description: string
  inputSchema: any
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

  private requiresConfirmation(name: string): boolean {
    return ['write', 'edit', 'bash', 'rm', 'mv'].includes(name)
  }

  private async askPermission(name: string, input: any): Promise<boolean> {
    console.log(`\nPermission required: ${name}`)
    console.log('Input:', JSON.stringify(input, null, 2))
    console.log('Allow? (y/n)')

    const decoder = new TextDecoder()
    const buffer = new Uint8Array(10)
    const n = await Bun.stdin.read(buffer)
    const answer = decoder.decode(buffer.slice(0, n)).trim().toLowerCase()

    return answer === 'y' || answer === 'yes'
  }
}

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry()

  // Register built-in tools
  const { BashTool } = require('./bash')
  const { ReadTool } = require('./read')
  const { WriteTool } = require('./write')
  const { EditTool } = require('./edit')
  const { GlobTool } = require('./glob')
  const { GrepTool } = require('./grep')
  const { LsTool } = require('./ls')
  const { CpTool } = require('./cp')
  const { MvTool } = require('./mv')
  const { RmTool } = require('./rm')

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

  return registry
}
