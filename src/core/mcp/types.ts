export interface StdioServerConfig {
  type: 'stdio'
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface HttpServerConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
}

export type McpServerConfig = StdioServerConfig | HttpServerConfig

export interface McpExposeConfig {
  tools: string[]
  transport: 'stdio' | 'http'
  port: number
}

export interface McpConfig {
  servers?: Record<string, McpServerConfig>
  expose?: McpExposeConfig
}

/** Shape of a tool returned by client.listTools() */
export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema?: unknown
}

/** Minimal interface for the SDK Client — used for testing via injection */
export interface SdkClientLike {
  connect(transport: unknown): Promise<void>
  listTools(): Promise<{ tools: McpToolDefinition[] }>
  callTool(params: { name: string; arguments: unknown }): Promise<{
    content: Array<{ type: string; text?: string }>
    isError?: boolean
  }>
  close(): Promise<void>
}

/** Factory that creates a connected SdkClientLike given a transport */
export type ClientFactory = (transport: unknown) => Promise<SdkClientLike>
