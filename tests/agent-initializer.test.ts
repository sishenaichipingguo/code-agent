import { describe, test, expect, beforeEach } from 'bun:test'
import { AgentInitializer } from '../src/core/agent/initializer'

describe('AgentInitializer', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  test('creates an initializer with default options', () => {
    const init = new AgentInitializer({ cwd: process.cwd() })
    expect(init).toBeInstanceOf(AgentInitializer)
  })

  test('exposes config after setup', async () => {
    const init = new AgentInitializer({ cwd: process.cwd() })
    await init.setup()
    expect(init.config).toBeDefined()
    expect(typeof init.config.model).toBe('string')
  })

  test('exposes model after setup', async () => {
    const init = new AgentInitializer({ cwd: process.cwd() })
    await init.setup()
    expect(init.model).toBeDefined()
    expect(typeof init.model.name).toBe('string')
  })

  test('exposes tools after setup', async () => {
    const init = new AgentInitializer({ cwd: process.cwd() })
    await init.setup()
    expect(init.tools).toBeDefined()
  })

  test('buildLoop returns an AgentLoop instance', async () => {
    const init = new AgentInitializer({ cwd: process.cwd() })
    await init.setup()
    const { AgentLoop } = await import('../src/core/agent/loop')
    const loop = init.buildLoop({ permissionMode: 'bypass' })
    expect(loop).toBeInstanceOf(AgentLoop)
  })
})
