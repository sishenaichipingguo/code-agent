import { describe, it, expect, mock } from 'bun:test'
import { AgentError, ErrorCode, withRetry } from './errors'

describe('AgentError', () => {
  it('sets name to AgentError', () => {
    const err = new AgentError(ErrorCode.API_ERROR, 'test')
    expect(err.name).toBe('AgentError')
    expect(err).toBeInstanceOf(Error)
  })

  it('stores code, message, details, and recoverable', () => {
    const err = new AgentError(ErrorCode.TOOL_NOT_FOUND, 'msg', { tool: 'bash' }, true)
    expect(err.code).toBe(ErrorCode.TOOL_NOT_FOUND)
    expect(err.message).toBe('msg')
    expect(err.details).toEqual({ tool: 'bash' })
    expect(err.recoverable).toBe(true)
  })

  it('defaults recoverable to false', () => {
    const err = new AgentError(ErrorCode.API_ERROR, 'msg')
    expect(err.recoverable).toBe(false)
  })

  describe('toUserMessage', () => {
    it('formats TOOL_NOT_FOUND with tool name', () => {
      const err = new AgentError(ErrorCode.TOOL_NOT_FOUND, 'msg', { tool: 'myTool' })
      expect(err.toUserMessage()).toContain('myTool')
    })

    it('formats PERMISSION_DENIED with tool name', () => {
      const err = new AgentError(ErrorCode.PERMISSION_DENIED, 'msg', { tool: 'write' })
      expect(err.toUserMessage()).toContain('write')
    })

    it('formats RATE_LIMIT with retryAfter', () => {
      const err = new AgentError(ErrorCode.RATE_LIMIT, 'msg', { retryAfter: 30 })
      expect(err.toUserMessage()).toContain('30')
    })

    it('formats RATE_LIMIT with default 60s when no retryAfter', () => {
      const err = new AgentError(ErrorCode.RATE_LIMIT, 'msg')
      expect(err.toUserMessage()).toContain('60')
    })

    it('covers all error codes without throwing', () => {
      for (const code of Object.values(ErrorCode)) {
        const err = new AgentError(code, 'test message')
        expect(() => err.toUserMessage()).not.toThrow()
      }
    })
  })

  describe('getSuggestion', () => {
    it('returns suggestion for API_ERROR', () => {
      const err = new AgentError(ErrorCode.API_ERROR, 'msg')
      expect(err.getSuggestion()).toContain('ANTHROPIC_API_KEY')
    })

    it('returns suggestion for NETWORK_ERROR', () => {
      const err = new AgentError(ErrorCode.NETWORK_ERROR, 'msg')
      expect(err.getSuggestion()).toBeTruthy()
    })

    it('returns null for codes without suggestions', () => {
      const err = new AgentError(ErrorCode.TOOL_NOT_FOUND, 'msg')
      expect(err.getSuggestion()).toBeNull()
    })
  })
})

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = mock(() => Promise.resolve('done'))
    const result = await withRetry(fn)
    expect(result).toBe('done')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on retryable error and eventually succeeds', async () => {
    let calls = 0
    const fn = mock(async () => {
      calls++
      if (calls < 3) throw new AgentError(ErrorCode.NETWORK_ERROR, 'net fail')
      return 'success'
    })

    const result = await withRetry(fn, { maxRetries: 3, backoff: 1 })
    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws after exhausting retries', async () => {
    const fn = mock(async () => {
      throw new AgentError(ErrorCode.NETWORK_ERROR, 'always fails')
    })

    await expect(withRetry(fn, { maxRetries: 2, backoff: 1 })).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-retryable errors', async () => {
    const fn = mock(async () => {
      throw new AgentError(ErrorCode.INVALID_INPUT, 'bad input')
    })

    await expect(withRetry(fn, { maxRetries: 3, backoff: 1 })).rejects.toThrow('bad input')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('does not retry plain errors', async () => {
    const fn = mock(async () => { throw new Error('plain error') })
    await expect(withRetry(fn, { maxRetries: 3, backoff: 1 })).rejects.toThrow('plain error')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('calls onRetry callback with attempt number', async () => {
    let calls = 0
    const retryAttempts: number[] = []
    const fn = mock(async () => {
      calls++
      if (calls < 3) throw new AgentError(ErrorCode.RATE_LIMIT, 'rate limited')
      return 'ok'
    })

    await withRetry(fn, {
      maxRetries: 3,
      backoff: 1,
      onRetry: (attempt) => retryAttempts.push(attempt)
    })

    expect(retryAttempts).toEqual([1, 2])
  })

  it('respects custom retryableErrors list', async () => {
    const fn = mock(async () => {
      throw new AgentError(ErrorCode.API_ERROR, 'api fail')
    })

    // API_ERROR is not in custom list
    await expect(withRetry(fn, {
      maxRetries: 3,
      backoff: 1,
      retryableErrors: [ErrorCode.NETWORK_ERROR]
    })).rejects.toThrow('api fail')

    expect(fn).toHaveBeenCalledTimes(1)
  })
})
