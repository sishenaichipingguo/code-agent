import type { AllowRule } from './types'

export function matchesRule(
  rule: AllowRule,
  toolName: string,
  input: unknown
): boolean {
  if (rule.tool !== toolName) return false
  const inp = input as Record<string, unknown>

  switch (rule.matcher.kind) {
    case 'bash-prefix': {
      if (typeof inp['command'] !== 'string') return false
      const cmd = inp['command'].trimStart()
      const prefix = rule.matcher.prefix.trimEnd()
      return cmd === prefix || cmd.startsWith(prefix + ' ') || cmd.startsWith(prefix + '\t')
    }
    case 'path-glob': {
      if (typeof inp['path'] !== 'string') return false
      return matchGlob(rule.matcher.glob, inp['path'])
    }
  }
}

function matchGlob(pattern: string, path: string): boolean {
  // Normalize to forward slashes for cross-platform matching
  const normalizedPattern = pattern.replace(/\\/g, '/')
  const normalizedPath = path.replace(/\\/g, '/')

  const regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*')

  const re = new RegExp('^' + regexStr + '$')
  return re.test(normalizedPath)
}
