import { describe, expect, test } from 'bun:test'
import { truncateOutput, truncateLine } from './output-limit'

describe('truncateOutput', () => {
  test('returns short text unchanged', () => {
    expect(truncateOutput('hello', 100)).toBe('hello')
  })

  test('truncates long text with head, tail, and a marker', () => {
    const text = 'a'.repeat(1000)
    const result = truncateOutput(text, 100)
    expect(result.length).toBeLessThan(text.length)
    expect(result).toContain('characters truncated')
    expect(result.startsWith('a')).toBe(true)
    expect(result.endsWith('a')).toBe(true)
  })
})

describe('truncateLine', () => {
  test('returns short line unchanged', () => {
    expect(truncateLine('short', 100)).toBe('short')
  })

  test('truncates a long line and reports dropped length', () => {
    const result = truncateLine('x'.repeat(50), 10)
    expect(result.startsWith('x'.repeat(10))).toBe(true)
    expect(result).toContain('40 more chars')
  })
})
