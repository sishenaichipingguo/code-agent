import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { MemoryCreateInput, MemoryType } from './types'

export class TeamStore {
  private indexPath: string

  constructor(private teamDir: string) {
    this.indexPath = join(teamDir, 'MEMORY.md')
  }

  save(input: MemoryCreateInput): void {
    this.ensureDir()
    const fileName = `${input.type}_${input.name.replace(/\s+/g, '_')}.md`
    const filePath = join(this.teamDir, fileName)

    const content = `---
name: ${input.name}
description: ${input.description}
type: ${input.type}
created: ${new Date().toISOString()}
---

${input.content}`

    writeFileSync(filePath, content)
    this.updateIndex(input.type, input.name, fileName, input.description)
  }

  /**
   * Returns a combined view of the team memory index and all file contents.
   * Returns empty string if the team directory does not exist.
   */
  loadIndex(): string {
    if (!existsSync(this.teamDir)) return ''
    if (!existsSync(this.indexPath)) return ''
    try {
      const index = readFileSync(this.indexPath, 'utf-8')
      const files = existsSync(this.teamDir)
        ? readdirSync(this.teamDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
        : []

      if (files.length === 0) return index

      const contentSections = files.map(f => {
        try {
          return readFileSync(join(this.teamDir, f), 'utf-8')
        } catch {
          return ''
        }
      }).filter(Boolean)

      return [index, ...contentSections].join('\n\n')
    } catch {
      return ''
    }
  }

  private ensureDir() {
    if (!existsSync(this.teamDir)) mkdirSync(this.teamDir, { recursive: true })
    if (!existsSync(this.indexPath)) {
      writeFileSync(this.indexPath, '# Team Memory Index\n\n## User\n\n## Feedback\n\n## Project\n\n## Reference\n')
    }
  }

  private updateIndex(type: MemoryType, name: string, fileName: string, description: string) {
    const sectionMap = { user: '## User', feedback: '## Feedback', project: '## Project', reference: '## Reference' }
    const section = sectionMap[type]
    const entry = `- [${name}](${fileName}) — ${description}`
    const lines = this.loadIndexRaw().split('\n')
    const sectionIdx = lines.findIndex(l => l === section)
    if (sectionIdx !== -1) {
      lines.splice(sectionIdx + 1, 0, entry)
      writeFileSync(this.indexPath, lines.join('\n'))
    }
  }

  private loadIndexRaw(): string {
    if (!existsSync(this.indexPath)) return ''
    try {
      return readFileSync(this.indexPath, 'utf-8')
    } catch {
      return ''
    }
  }
}
