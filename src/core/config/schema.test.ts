import { describe, it, expect } from 'bun:test'
import { ConfigSchema, DEFAULT_CONFIG } from './schema'

describe('ConfigSchema', () => {
  it('parses a minimal config with defaults', () => {
    const result = ConfigSchema.parse({})
    expect(result.model).toBe('claude-sonnet-4')
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
    expect(DEFAULT_CONFIG.model).toBe('claude-sonnet-4')
    expect(DEFAULT_CONFIG.mode).toBe('yolo')
    expect(DEFAULT_CONFIG.session?.autoSave).toBe(true)
    expect(DEFAULT_CONFIG.session?.saveDir).toBe('.agent/sessions')
    expect(DEFAULT_CONFIG.logging?.level).toBe('info')
  })
})
