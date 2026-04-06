import { describe, it, expect } from 'bun:test'
import { truncateMemoryIndex, MAX_ENTRYPOINT_LINES, MAX_ENTRYPOINT_BYTES } from './limits'

describe('truncateMemoryIndex', () => {
  it('returns content unchanged when within limits', () => {
    const content = '- [foo](foo.md) — bar\n'.repeat(5)
    expect(truncateMemoryIndex(content)).toBe(content)
  })

  it('truncates to MAX_ENTRYPOINT_LINES and appends truncation note', () => {
    const line = '- [x](x.md) — desc\n'
    const content = line.repeat(MAX_ENTRYPOINT_LINES + 50)
    const result = truncateMemoryIndex(content)
    const lines = result.split('\n').filter(Boolean)
    expect(lines.length).toBeLessThanOrEqual(MAX_ENTRYPOINT_LINES + 1)
    expect(result).toContain('[truncated]')
  })

  it('truncates when byte size exceeds MAX_ENTRYPOINT_BYTES', () => {
    const longLine = '- [x](x.md) — ' + 'a'.repeat(500) + '\n'
    const content = longLine.repeat(60)
    const result = truncateMemoryIndex(content)
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(MAX_ENTRYPOINT_BYTES + 200)
    expect(result).toContain('[truncated]')
  })
})
