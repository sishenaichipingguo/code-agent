import type { Memory, MemoryCreateInput, MemoryUpdateInput, MemoryType } from './types'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'

export class MemoryManager {
  private memoryDir: string        // write target (may be namespaced)
  private rootMemoryDir: string    // always the root .claude/memory
  private indexPath: string        // always root MEMORY.md

  constructor(projectRoot: string) {
    this.rootMemoryDir = join(projectRoot, '.claude', 'memory')
    const namespace = process.env.MEMORY_NAMESPACE
    this.memoryDir = namespace
      ? join(this.rootMemoryDir, namespace)
      : this.rootMemoryDir
    this.indexPath = join(this.rootMemoryDir, 'MEMORY.md')
    this.ensureMemoryDir()
  }

  private ensureMemoryDir() {
    if (!existsSync(this.rootMemoryDir)) {
      mkdirSync(this.rootMemoryDir, { recursive: true })
    }
    if (!existsSync(this.indexPath)) {
      writeFileSync(this.indexPath, '# Memory Index\n\n## User\n\n## Feedback\n\n## Project\n\n## Reference\n')
    }
    if (this.memoryDir !== this.rootMemoryDir && !existsSync(this.memoryDir)) {
      mkdirSync(this.memoryDir, { recursive: true })
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

  update(input: MemoryUpdateInput): Memory {
    const fileName = `${input.type}_${input.name.replace(/\s+/g, '_')}.md`
    const filePath = join(this.memoryDir, fileName)
    if (!existsSync(filePath)) throw new Error(`Memory not found: ${input.name}`)

    const frontmatter = `---
name: ${input.name}
description: ${input.description}
type: ${input.type}
created: ${this.readCreatedDate(filePath)}
updated: ${new Date().toISOString()}
---

${input.content}`

    writeFileSync(filePath, frontmatter)
    this.replaceIndexEntry(input.type, input.name, fileName, input.description)

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

  delete(name: string): void {
    const files = readdirSync(this.memoryDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md')
    const target = files.find(f => {
      const raw = readFileSync(join(this.memoryDir, f), 'utf-8')
      return raw.match(/^name: (.+)$/m)?.[1]?.trim() === name
    })
    if (!target) throw new Error(`Memory not found: ${name}`)
    unlinkSync(join(this.memoryDir, target))
    this.removeIndexEntry(name)
  }

  private readCreatedDate(filePath: string): string {
    try {
      const raw = readFileSync(filePath, 'utf-8')
      return raw.match(/^created: (.+)$/m)?.[1]?.trim() ?? new Date().toISOString()
    } catch {
      return new Date().toISOString()
    }
  }

  private replaceIndexEntry(type: MemoryType, name: string, fileName: string, description: string) {
    let index = readFileSync(this.indexPath, 'utf-8')
    index = index.split('\n').filter(l => !l.includes(`[${name}]`)).join('\n')
    writeFileSync(this.indexPath, index)
    this.updateIndex(type, name, fileName, description)
  }

  private removeIndexEntry(name: string) {
    const index = readFileSync(this.indexPath, 'utf-8')
    const updated = index.split('\n').filter(l => !l.includes(`[${name}]`)).join('\n')
    writeFileSync(this.indexPath, updated)
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
