import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { PluginManifest, LoadedPlugin } from './types'

export class PluginManager {
  private loaded = new Map<string, LoadedPlugin>()

  constructor(private dirs: string[]) {}

  async discover(): Promise<void> {
    for (let i = 0; i < this.dirs.length; i++) {
      const dir = this.dirs[i]
      if (!existsSync(dir)) continue

      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const pluginDir = join(dir, entry.name)
        const manifestPath = join(pluginDir, 'plugin.json')
        if (!existsSync(manifestPath)) continue

        try {
          const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
          if (!manifest.name || !manifest.version) continue
          this.loaded.delete(manifest.name)
          this.loaded.set(manifest.name, {
            name: manifest.name,
            version: manifest.version,
            dir: pluginDir,
            skills: manifest.skills
          })
        } catch (err: any) {
          process.stderr.write(`[plugin-manager] Failed to load plugin at ${pluginDir}: ${err.message}\n`)
        }
      }
    }
  }

  getLoaded(): LoadedPlugin[] {
    return Array.from(this.loaded.values())
  }

  getSkillDirs(): string[] {
    const dirs: string[] = []
    for (const plugin of this.loaded.values()) {
      if (plugin.skills && plugin.skills.length > 0) {
        for (const s of plugin.skills) {
          dirs.push(join(plugin.dir, s))
        }
      } else {
        dirs.push(join(plugin.dir, 'skills'))
      }
    }
    return dirs
  }
}
