import { describe, test, expect } from 'bun:test'

describe('AgentBackend interface', () => {
  test('BackendType values are defined', async () => {
    const { BACKEND_TYPES } = await import('../src/core/agent/backends/types')
    expect(BACKEND_TYPES).toContain('in-process')
    expect(BACKEND_TYPES).toContain('tmux')
    expect(BACKEND_TYPES).toContain('iterm2')
  })
})

describe('InProcessBackend', () => {
  test('implements AgentBackend interface', async () => {
    const { InProcessBackend } = await import('../src/core/agent/backends/in-process')
    const backend = new InProcessBackend()
    expect(backend.name).toBe('in-process')
    expect(typeof backend.execute).toBe('function')
    expect(typeof backend.kill).toBe('function')
  })

  test('kill() before execute does not throw', async () => {
    const { InProcessBackend } = await import('../src/core/agent/backends/in-process')
    const backend = new InProcessBackend()
    expect(() => backend.kill()).not.toThrow()
  })
})

describe('TmuxBackend', () => {
  test('implements AgentBackend interface', async () => {
    const { TmuxBackend } = await import('../src/core/agent/backends/tmux')
    const backend = new TmuxBackend()
    expect(backend.name).toBe('tmux')
    expect(typeof backend.execute).toBe('function')
    expect(typeof backend.kill).toBe('function')
  })

  test('kill() before execute does not throw', async () => {
    const { TmuxBackend } = await import('../src/core/agent/backends/tmux')
    const backend = new TmuxBackend()
    expect(() => backend.kill()).not.toThrow()
  })
})

describe('ITerm2Backend', () => {
  test('implements AgentBackend interface', async () => {
    const { ITerm2Backend } = await import('../src/core/agent/backends/iterm2')
    const backend = new ITerm2Backend()
    expect(backend.name).toBe('iterm2')
    expect(typeof backend.execute).toBe('function')
    expect(typeof backend.kill).toBe('function')
  })

  test('kill() before execute does not throw', async () => {
    const { ITerm2Backend } = await import('../src/core/agent/backends/iterm2')
    const backend = new ITerm2Backend()
    expect(() => backend.kill()).not.toThrow()
  })
})

describe('BackendFactory', () => {
  test('detect() returns in-process when no tmux or iTerm2', async () => {
    const { BackendFactory } = await import('../src/core/agent/backends/factory')
    const origTmux = process.env.TMUX
    const origIterm = process.env.ITERM_SESSION_ID
    delete process.env.TMUX
    delete process.env.ITERM_SESSION_ID
    const backend = BackendFactory.detect()
    expect(backend.name).toBe('in-process')
    if (origTmux !== undefined) process.env.TMUX = origTmux
    if (origIterm !== undefined) process.env.ITERM_SESSION_ID = origIterm
  })

  test('create() returns correct backend for each type', async () => {
    const { BackendFactory } = await import('../src/core/agent/backends/factory')
    expect(BackendFactory.create('in-process').name).toBe('in-process')
    expect(BackendFactory.create('tmux').name).toBe('tmux')
    expect(BackendFactory.create('iterm2').name).toBe('iterm2')
  })
})

describe('AgentDispatcher with backend', () => {
  test('uses in-process backend by default', async () => {
    const { AgentDispatcher } = await import('../src/core/agent/dispatcher')
    const dispatcher = new AgentDispatcher()
    expect((dispatcher as any).backendType).toBe('in-process')
  })
})
