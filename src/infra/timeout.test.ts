import { describe, it, expect } from 'bun:test'
import { executeWithTimeout } from './timeout'

describe('executeWithTimeout', () => {
  it('resolves when promise completes before timeout', async () => {
    const result = await executeWithTimeout(
      Promise.resolve('ok'),
      1000
    )
    expect(result).toBe('ok')
  })

  it('rejects with default error when timeout exceeded', async () => {
    const slow = new Promise<string>(resolve => setTimeout(() => resolve('late'), 200))
    await expect(executeWithTimeout(slow, 50)).rejects.toThrow('Timeout after 50ms')
  })

  it('rejects with custom error when timeout exceeded', async () => {
    const slow = new Promise<string>(resolve => setTimeout(() => resolve('late'), 200))
    const customError = new Error('custom timeout')
    await expect(executeWithTimeout(slow, 50, customError)).rejects.toThrow('custom timeout')
  })

  it('propagates rejection from the original promise', async () => {
    const failing = Promise.reject(new Error('original error'))
    await expect(executeWithTimeout(failing, 1000)).rejects.toThrow('original error')
  })

  it('resolves with correct value for async operations', async () => {
    const delayed = new Promise<number>(resolve => setTimeout(() => resolve(42), 10))
    const result = await executeWithTimeout(delayed, 500)
    expect(result).toBe(42)
  })
})
