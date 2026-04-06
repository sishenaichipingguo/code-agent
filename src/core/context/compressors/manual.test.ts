import { describe, it, expect, mock } from 'bun:test'
import { ManualCompactor } from './manual'
import type { RawMessage } from './types'

const mockModel = {
  name: 'test-model',
  capabilities: { tools: false, streaming: false, vision: false },
  chat: mock(async () => ({
    type: 'text' as const,
    content: 'Structured summary:\n- Files modified: foo.ts, bar.ts\n- Current task: fix tests\n- Open questions: none'
  }))
}

describe('ManualCompactor', () => {
  it('compresses entire history into one summary message', async () => {
    const messages: RawMessage[] = Array.from({ length: 8 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i}`
    }))
    const compressor = new ManualCompactor()
    const result = await compressor.run(messages, mockModel as any, 'test-model')
    // Manual always returns empty messages array (summary replaces everything)
    expect(result.messages.length).toBe(0)
    expect(result.summary).toContain('Files modified')
  })

  it('returns empty messages and full summary even for short histories', async () => {
    const messages: RawMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' }
    ]
    const compressor = new ManualCompactor()
    const result = await compressor.run(messages, mockModel as any, 'test-model')
    expect(result.messages.length).toBe(0)
    expect(result.summary.length).toBeGreaterThan(0)
  })
})
