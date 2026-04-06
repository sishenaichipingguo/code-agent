import { describe, it, expect, mock } from 'bun:test'
import { MicroCompactor } from './micro'
import type { RawMessage } from './types'

const mockModel = {
  name: 'test-model',
  capabilities: { tools: false, streaming: false, vision: false },
  chat: mock(async () => ({
    type: 'text' as const,
    content: 'Micro summary: first few messages dealt with setup.'
  }))
}

describe('MicroCompactor', () => {
  it('only summarizes the oldest 20% of messages', async () => {
    const messages: RawMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i}`
    }))
    const compressor = new MicroCompactor()
    const result = await compressor.run(messages, mockModel as any, 'test-model')
    // 20% of 20 = 4 messages summarized → 16 remaining (marker added by manager, not here)
    expect(result.messages.length).toBe(16)
  })

  it('returns original messages when too few to micro-compress', async () => {
    const messages: RawMessage[] = Array.from({ length: 4 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i}`
    }))
    const compressor = new MicroCompactor()
    const result = await compressor.run(messages, mockModel as any, 'test-model')
    expect(result.messages.length).toBe(4)
    expect(result.summary).toBe('')
  })

  it('includes summary in result', async () => {
    const messages: RawMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i}`
    }))
    const compressor = new MicroCompactor()
    const result = await compressor.run(messages, mockModel as any, 'test-model')
    expect(result.summary).toBe('Micro summary: first few messages dealt with setup.')
  })
})
