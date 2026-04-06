import { describe, it, expect, mock } from 'bun:test'
import { AutoCompressor } from './auto'
import type { RawMessage } from './types'

const mockModel = {
  name: 'test-model',
  capabilities: { tools: false, streaming: false, vision: false },
  chat: mock(async () => ({
    type: 'text' as const,
    content: 'Summary of past work: edited foo.ts and fixed a bug.'
  }))
}

const messages: RawMessage[] = [
  { role: 'user', content: 'Fix the bug in foo.ts' },
  { role: 'assistant', content: [{ type: 'text', text: 'Reading the file...' }] },
  { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'content of foo.ts' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
  { role: 'user', content: 'Now fix bar.ts' },
  { role: 'assistant', content: [{ type: 'text', text: 'On it.' }] },
]

describe('AutoCompressor', () => {
  it('preserves KEEP_RECENT_ROUNDS * 2 messages verbatim', async () => {
    const compressor = new AutoCompressor()
    const result = await compressor.run(messages, mockModel as any, 'test-model')
    // KEEP_RECENT_ROUNDS = 3 → keeps last 6 messages
    // With 6 total messages, nothing gets summarized (not enough to compress)
    expect(result.messages.length).toBe(messages.length)
  })

  it('summarizes old messages when history is long enough', async () => {
    const longMessages: RawMessage[] = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i}`
    }))
    const compressor = new AutoCompressor()
    const result = await compressor.run(longMessages, mockModel as any, 'test-model')
    // Should compress down to KEEP_RECENT_ROUNDS*2 = 6 messages kept
    expect(result.messages.length).toBeLessThan(longMessages.length)
    expect(result.summary).toBe('Summary of past work: edited foo.ts and fixed a bug.')
  })

  it('includes summary text in result', async () => {
    const longMessages: RawMessage[] = Array.from({ length: 12 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message ${i}`
    }))
    const compressor = new AutoCompressor()
    const result = await compressor.run(longMessages, mockModel as any, 'test-model')
    expect(result.summary).toContain('Summary of past work')
  })
})
