import { describe, it, expect, mock } from 'bun:test'
import { ContextManager } from './manager'
import type { RawMessage } from './compressors/types'

const mockModel = {
  name: 'claude-sonnet-4-6',
  capabilities: { tools: false, streaming: false, vision: false },
  chat: mock(async () => ({ type: 'text' as const, content: 'summary text' }))
}

const makeMessages = (n: number): RawMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `message ${i}`
  }))

describe('ContextManager', () => {
  describe('shouldCompress', () => {
    it('returns false below 80% threshold', () => {
      const cm = new ContextManager(mockModel as any, 'claude-sonnet-4-6')
      expect(cm.shouldCompress(100_000)).toBe(false)
    })

    it('returns true at 80% threshold', () => {
      const cm = new ContextManager(mockModel as any, 'claude-sonnet-4-6')
      expect(cm.shouldCompress(160_001)).toBe(true)
    })
  })

  describe('compress with auto strategy', () => {
    it('returns compressed messages with re-hydration marker prepended', async () => {
      const cm = new ContextManager(mockModel as any, 'claude-sonnet-4-6')
      const messages = makeMessages(12)
      const result = await cm.compress(messages, 'auto')
      // First message should be the re-hydration marker
      expect(result[0].role).toBe('user')
      expect(result[0].content).toContain('[Context compressed')
      expect(result.length).toBeLessThan(messages.length + 1)
    })
  })

  describe('compress with micro strategy', () => {
    it('only compresses oldest 20% and prepends marker', async () => {
      const cm = new ContextManager(mockModel as any, 'claude-sonnet-4-6')
      const messages = makeMessages(20)
      const result = await cm.compress(messages, 'micro')
      expect(result[0].content).toContain('[Context compressed')
      // micro compresses 4 messages → 1 marker + 16 remaining = 17
      expect(result.length).toBe(17)
    })
  })

  describe('compress with manual strategy', () => {
    it('replaces all messages with marker + summary', async () => {
      const cm = new ContextManager(mockModel as any, 'claude-sonnet-4-6')
      const messages = makeMessages(10)
      const result = await cm.compress(messages, 'manual')
      expect(result.length).toBe(1)
      expect(result[0].content).toContain('[Context compressed')
    })
  })

  describe('ptlRetry', () => {
    it('calls fn and returns result when no PTL error', async () => {
      const cm = new ContextManager(mockModel as any, 'claude-sonnet-4-6')
      const messages = makeMessages(12)
      let called = false
      const result = await cm.ptlRetry(messages, async () => {
        called = true
        return 'success'
      })
      expect(called).toBe(true)
      expect(result).toBe('success')
    })

    it('compresses and retries once when PTL error is thrown', async () => {
      const cm = new ContextManager(mockModel as any, 'claude-sonnet-4-6')
      const messages = makeMessages(12)
      let callCount = 0
      const result = await cm.ptlRetry(messages, async () => {
        callCount++
        if (callCount === 1) throw new Error('prompt is too long')
        return 'success after retry'
      })
      expect(callCount).toBe(2)
      expect(result).toBe('success after retry')
    })
  })
})
