import { existsSync, readFileSync } from 'fs'
import { join, dirname, parse as parsePath } from 'path'
import { homedir } from 'os'

/**
 * Finds and loads all CLAUDE.md files relevant to the given directory.
 * Load order: global (~/.claude/CLAUDE.md) → repo root → subdirectories down to cwd.
 * Later entries take precedence (appended after earlier ones).
 */
export async function loadClaudeMd(cwd: string): Promise<string> {
  const sections: string[] = []

  // 1. Global CLAUDE.md
  const globalPath = join(homedir(), '.claude', 'CLAUDE.md')
  if (existsSync(globalPath)) {
    const content = readFileSync(globalPath, 'utf-8').trim()
    if (content) sections.push(`[Global instructions — ~/.claude/CLAUDE.md]\n${content}`)
  }

  // 2. Walk from cwd up to filesystem root, collect paths
  const ancestors: string[] = []
  let dir = cwd
  while (true) {
    ancestors.push(dir)
    const parent = dirname(dir)
    if (parent === dir) break  // reached root
    dir = parent
  }

  // Reverse so we go root → cwd (outer → inner)
  ancestors.reverse()

  for (const ancestor of ancestors) {
    const claudePath = join(ancestor, 'CLAUDE.md')
    if (existsSync(claudePath)) {
      const content = readFileSync(claudePath, 'utf-8').trim()
      if (content) {
        const label = ancestor === cwd ? 'CLAUDE.md' : `CLAUDE.md (${ancestor})`
        sections.push(`[Project instructions — ${label}]\n${content}`)
      }
    }
  }

  return sections.join('\n\n')
}
