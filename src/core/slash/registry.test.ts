import { describe, it, expect } from 'bun:test'
import { SlashCommandRegistry } from './registry'
import type { CommandContext } from './types'

const mockCtx = {} as CommandContext

describe('SlashCommandRegistry', () => {
  it('returns unknown for non-slash input', async () => {
    const reg = new SlashCommandRegistry()
    const result = await reg.dispatch('hello world', mockCtx)
    expect(result.type).toBe('unknown')
  })

  it('dispatches a registered handler command', async () => {
    const reg = new SlashCommandRegistry()
    reg.register({
      name: 'test',
      description: 'test cmd',
      args: 'none',
      handler: async () => ({ type: 'handled' })
    })
    const result = await reg.dispatch('/test', mockCtx)
    expect(result.type).toBe('handled')
  })

  it('injects prompt for skill command with args substitution', async () => {
    const reg = new SlashCommandRegistry()
    reg.register({
      name: 'review',
      description: 'review',
      args: 'optional',
      prompt: 'Review code. Focus on: {{args}}'
    })
    const result = await reg.dispatch('/review security', mockCtx)
    expect(result.type).toBe('inject')
    if (result.type === 'inject') {
      expect(result.message).toBe('Review code. Focus on: security')
    }
  })

  it('higher priority registration overrides lower', async () => {
    const reg = new SlashCommandRegistry()
    reg.register({ name: 'foo', description: 'low', args: 'none', handler: async () => ({ type: 'handled' }) }, 0)
    reg.register({ name: 'foo', description: 'high', args: 'none', handler: async () => ({ type: 'inject', message: 'hi' }) }, 10)
    const result = await reg.dispatch('/foo', mockCtx)
    expect(result.type).toBe('inject')
  })

  it('returns unknown for unregistered command', async () => {
    const reg = new SlashCommandRegistry()
    const result = await reg.dispatch('/notexist', mockCtx)
    expect(result.type).toBe('unknown')
  })

  it('passes args string to handler context', async () => {
    const reg = new SlashCommandRegistry()
    let capturedArgs = ''
    reg.register({
      name: 'echo',
      description: 'echo',
      args: 'optional',
      handler: async (ctx) => { capturedArgs = ctx.args; return { type: 'handled' } }
    })
    await reg.dispatch('/echo hello world', mockCtx)
    expect(capturedArgs).toBe('hello world')
  })

  it('getAll returns all registered commands', () => {
    const reg = new SlashCommandRegistry()
    reg.register({ name: 'alpha', description: 'a', args: 'none', handler: async () => ({ type: 'handled' }) })
    reg.register({ name: 'beta', description: 'b', args: 'none', handler: async () => ({ type: 'handled' }) })
    reg.register({ name: 'gamma', description: 'g', args: 'none', handler: async () => ({ type: 'handled' }) })
    const all = reg.getAll()
    expect(all).toHaveLength(3)
    const names = all.map(c => c.name)
    expect(names).toContain('alpha')
    expect(names).toContain('beta')
    expect(names).toContain('gamma')
  })

  it('writes to stderr for unknown command', async () => {
    const reg = new SlashCommandRegistry()
    const written: string[] = []
    const original = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: any) => { written.push(String(chunk)); return true }
    try {
      await reg.dispatch('/nope', mockCtx)
    } finally {
      process.stderr.write = original
    }
    expect(written.some(s => s.includes('/nope'))).toBe(true)
  })
})
