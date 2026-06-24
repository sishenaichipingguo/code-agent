// Tool output guards. Unbounded tool results (a huge file, a repo-wide grep)
// can blow the entire context window in a single turn, so reads and searches
// cap their output and tell the model when something was cut.

/** ~25k tokens — a single tool result should not dominate the context window. */
export const MAX_OUTPUT_CHARS = 100_000
/** Default line cap for `read` when the caller does not pass an explicit limit. */
export const DEFAULT_READ_LINES = 2000
/** Single lines longer than this are truncated (minified bundles, data blobs). */
export const MAX_LINE_LENGTH = 2000

/** Clamp a long string to maxChars, keeping the head and tail with a marker. */
export function truncateOutput(
  text: string,
  maxChars: number = MAX_OUTPUT_CHARS
): string {
  if (text.length <= maxChars) return text
  const omitted = text.length - maxChars
  const head = Math.floor(maxChars * 0.6)
  const tail = maxChars - head
  return (
    text.slice(0, head) +
    `\n... [${omitted.toLocaleString()} characters truncated] ...\n` +
    text.slice(text.length - tail)
  )
}

/** Truncate a single line, preserving its start and noting the dropped length. */
export function truncateLine(
  line: string,
  maxLength: number = MAX_LINE_LENGTH
): string {
  if (line.length <= maxLength) return line
  return `${line.slice(0, maxLength)}… [${line.length - maxLength} more chars]`
}
