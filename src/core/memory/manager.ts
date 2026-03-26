import type { Memory, MemoryCreateInput, MemoryType } from './types'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'

export class MemoryManager {
  private memoryDir: string
  private indexPath: string

  constructor(projectRoot: string) {
    this.memoryDir = join(projectRoot, '.claude', 'memory')
    this.indexPath = join(this.memoryDir, 'MEMORY.md')
    this.ensureMemoryDir()
  }

  private ensureMemoryDir() {
    if (!existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true })
    }
    if (!existsSync(this.indexPath)) {
      writeFileSync(this.indexPath, '# Memory Index\n\n## User\n\n## Feedback\n\n## Project\n\n## Reference\n')
    }
  }

  save(input: MemoryCreateInput): Memory {
    const fileName = `${input.type}_${input.name.replace(/\s+/g, '_')}.md`
    const filePath = join(this.memoryDir, fileName)

    const frontmatter = `---
name: ${input.name}
description: ${input.description}
type: ${input.type}
created: ${new Date().toISOString()}
updated: ${new Date().toISOString()}
---

${input.content}`

    writeFileSync(filePath, frontmatter)
    this.updateIndex(input.type, input.name, fileName, input.description)

    return {
      name: input.name,
      description: input.description,
      type: input.type,
      content: input.content,
      created: new Date(),
      updated: new Date(),
      filePath
    }
  }

  private updateIndex(type: MemoryType, name: string, fileName: string, description: string) {
    let index = readFileSync(this.indexPath, 'utf-8')
    const sectionMap = { user: '## User', feedback: '## Feedback', project: '## Project', reference: '## Reference' }
    const section = sectionMap[type]
    const entry = `- [${name}](${fileName}) — ${description}`

    const lines = index.split('\n')
    const sectionIdx = lines.findIndex(l => l === section)
    if (sectionIdx !== -1) {
      lines.splice(sectionIdx + 1, 0, entry)
      writeFileSync(this.indexPath, lines.join('\n'))
    }
  }

  loadIndex(): string {
    return readFileSync(this.indexPath, 'utf-8')
  }

  loadMemory(fileName: string): string {
    return readFileSync(join(this.memoryDir, fileName), 'utf-8')
  }
}
