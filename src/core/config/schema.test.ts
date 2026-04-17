import { describe, it, expect } from 'bun:test'
import { ConfigSchema, DEFAULT_CONFIG } from './schema'

describe('ConfigSchema', () => {
  it('parses a minimal config with defaults', () => {
    const result = ConfigSchema.parse({})
    expect(result.model).toBe('claude-sonnet-4-6')
    expect(result.mode).toBe('yolo')
    expect(result.provider).toBe('anthropic')
  })

  it('accepts valid provider values', () => {
    for (const provider of ['anthropic', 'ollama', 'openai', 'openai-compatible'] as const) {
      const result = ConfigSchema.parse({ provider })
      expect(result.provider).toBe(provider)
    }
  })

  it('rejects invalid provider', () => {
    expect(() => ConfigSchema.parse({ provider: 'invalid' })).toThrow()
  })

  it('accepts valid mode values', () => {
    expect(ConfigSchema.parse({ mode: 'yolo' }).mode).toBe('yolo')
    expect(ConfigSchema.parse({ mode: 'safe' }).mode).toBe('safe')
  })

  it('rejects invalid mode', () => {
    expect(() => ConfigSchema.parse({ mode: 'dangerous' })).toThrow()
  })

  it('accepts optional apiKey and baseUrl', () => {
    const result = ConfigSchema.parse({ apiKey: 'sk-123', baseUrl: 'http://localhost:11434' })
    expect(result.apiKey).toBe('sk-123')
    expect(result.baseUrl).toBe('http://localhost:11434')
  })

  it('parses tools config with bash timeout', () => {
    const result = ConfigSchema.parse({ tools: { bash: { timeout: 60000 } } })
    expect(result.tools?.bash?.timeout).toBe(60000)
  })

  it('parses tools config with rm confirm flag', () => {
    const result = ConfigSchema.parse({ tools: { rm: { confirm: false } } })
    expect(result.tools?.rm?.confirm).toBe(false)
  })

  it('parses session config', () => {
    const result = ConfigSchema.parse({
      session: { autoSave: false, saveDir: '/tmp/sessions' }
    })
    expect(result.session?.autoSave).toBe(false)
    expect(result.session?.saveDir).toBe('/tmp/sessions')
  })

  it('parses logging config', () => {
    const result = ConfigSchema.parse({
      logging: { level: 'debug', file: '/tmp/agent.log' }
    })
    expect(result.logging?.level).toBe('debug')
    expect(result.logging?.file).toBe('/tmp/agent.log')
  })

  it('rejects invalid log level', () => {
    expect(() => ConfigSchema.parse({ logging: { level: 'verbose' } })).toThrow()
  })
})

describe('DEFAULT_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_CONFIG.model).toBe('claude-sonnet-4-6')
    expect(DEFAULT_CONFIG.mode).toBe('yolo')
    expect(DEFAULT_CONFIG.session?.autoSave).toBe(true)
    expect(DEFAULT_CONFIG.session?.saveDir).toBe('.agent/sessions')
    expect(DEFAULT_CONFIG.logging?.level).toBe('info')
  })
})

describe('mcp config', () => {
  it('accepts stdio server config', () => {
    const result = ConfigSchema.safeParse({
      mcp: {
        servers: {
          filesystem: {
            type: 'stdio',
            command: 'npx',
            args: ['@modelcontextprotocol/server-filesystem', '/tmp']
          }
        }
      }
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const server = result.data.mcp?.servers?.['filesystem']
      expect(server?.type).toBe('stdio')
      if (server?.type === 'stdio') {
        expect(server.command).toBe('npx')
        expect(server.args).toEqual(['@modelcontextprotocol/server-filesystem', '/tmp'])
      }
    }
  })

  it('accepts http server config', () => {
    const result = ConfigSchema.safeParse({
      mcp: {
        servers: {
          remote: { type: 'http', url: 'http://localhost:3000/sse' }
        }
      }
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const server = result.data.mcp?.servers?.['remote']
      expect(server?.type).toBe('http')
      if (server?.type === 'http') {
        expect(server.url).toBe('http://localhost:3000/sse')
      }
    }
  })

  it('rejects invalid server type', () => {
    const result = ConfigSchema.safeParse({
      mcp: { servers: { bad: { type: 'websocket', url: 'ws://localhost' } } }
    })
    expect(result.success).toBe(false)
  })

  it('accepts expose config with defaults', () => {
    const result = ConfigSchema.safeParse({
      mcp: { expose: {} }
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mcp?.expose?.tools).toEqual(['read', 'glob', 'grep', 'ls'])
      expect(result.data.mcp?.expose?.transport).toBe('stdio')
      expect(result.data.mcp?.expose?.port).toBe(3100)
    }
  })

  it('mcp field is optional — existing configs still parse', () => {
    const result = ConfigSchema.safeParse({ model: 'claude-sonnet-4-6', mode: 'yolo' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.mcp).toBeUndefined()
  })
})
