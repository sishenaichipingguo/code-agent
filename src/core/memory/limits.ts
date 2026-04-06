export const MAX_ENTRYPOINT_LINES = 200
export const MAX_ENTRYPOINT_BYTES = 25_000

export function truncateMemoryIndex(content: string): string {
  const lines = content.split('\n')

  // Trim by line count
  if (lines.length > MAX_ENTRYPOINT_LINES) {
    const kept = lines.slice(0, MAX_ENTRYPOINT_LINES)
    return kept.join('\n') + '\n\n... [truncated] (memory index exceeded line limit)'
  }

  // Trim by byte count
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes > MAX_ENTRYPOINT_BYTES) {
    let result = ''
    for (const line of lines) {
      const candidate = result + line + '\n'
      if (Buffer.byteLength(candidate, 'utf8') > MAX_ENTRYPOINT_BYTES) break
      result = candidate
    }
    return result + '\n... [truncated] (memory index exceeded byte limit)'
  }

  return content
}
