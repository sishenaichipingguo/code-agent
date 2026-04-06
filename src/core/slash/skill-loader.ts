import matter from 'gray-matter'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { SlashCommandRegistry } from './registry'

export class SkillLoader {
  constructor(private dirs: string[]) {}

  async loadInto(registry: SlashCommandRegistry): Promise<void> {
    for (let i = 0; i < this.dirs.length; i++) {
      const dir = this.dirs[i]
      const priority = i  // later dirs = higher priority
      if (!existsSync(dir)) continue

      const files = readdirSync(dir).filter(f => f.endsWith('.md'))
      for (const file of files) {
        try {
          const raw = readFileSync(join(dir, file), 'utf-8')
          const { data, content } = matter(raw)

          const name: string = data.name || data.trigger?.replace(/^\//, '')
          if (!name || !data.description) {
            process.stderr.write(`[skill-loader] Skipping ${file}: missing name or description\n`)
            continue
          }

          registry.register({
            name,
            description: data.description,
            args: data.args ?? 'optional',
            prompt: content.trim()
          }, priority)
        } catch (err: any) {
          process.stderr.write(`[skill-loader] Failed to load ${file}: ${err.message}\n`)
        }
      }
    }
  }
}
