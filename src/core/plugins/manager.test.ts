import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { PluginManager } from './manager'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import os from 'os'

describe('PluginManager', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(os.tmpdir(), `plugin-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('loads a valid plugin from directory', async () => {
    const pluginDir = join(tmpDir, 'my-plugin')
    mkdirSync(pluginDir)
    writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
      name: 'my-plugin',
      version: '1.0.0',
      skills: ['skills/']
    }))

    const manager = new PluginManager([tmpDir])
    await manager.discover()

    expect(manager.getLoaded()).toHaveLength(1)
    expect(manager.getLoaded()[0].name).toBe('my-plugin')
  })

  it('skips directories without plugin.json', async () => {
    mkdirSync(join(tmpDir, 'not-a-plugin'))

    const manager = new PluginManager([tmpDir])
    await manager.discover()

    expect(manager.getLoaded()).toHaveLength(0)
  })

  it('later discovery dirs have higher priority (returned first)', async () => {
    const dir2 = join(os.tmpdir(), `plugin-test2-${Date.now()}`)
    mkdirSync(dir2, { recursive: true })

    const p1 = join(tmpDir, 'shared-plugin')
    mkdirSync(p1)
    writeFileSync(join(p1, 'plugin.json'), JSON.stringify({ name: 'shared-plugin', version: '1.0.0' }))

    const p2 = join(dir2, 'shared-plugin')
    mkdirSync(p2)
    writeFileSync(join(p2, 'plugin.json'), JSON.stringify({ name: 'shared-plugin', version: '2.0.0' }))

    const manager = new PluginManager([tmpDir, dir2])
    await manager.discover()

    expect(manager.getLoaded()[0].version).toBe('2.0.0')

    rmSync(dir2, { recursive: true, force: true })
  })
})
