+import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { SkillLoader } from './skill-loader'
import { SlashCommandRegistry } from './registry'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import os from 'os'

describe('SkillLoader', () => {
  let tmpDir: string
  let registry: SlashCommandRegistry

  beforeEach(() => {
    tmpDir = join(os.tmpdir(), `skill-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    registry = new SlashCommandRegistry()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('loads a valid skill file and registers it', async () => {
    writeFileSync(join(tmpDir, 'review.md'), `---
name: review
description: Review code
trigger: /review
args: optional
---

Review the code. Focus on: {{args}}`)

    const loader = new SkillLoader([tmpDir])
    await loader.loadInto(registry)

    const cmds = registry.getAll()
    expect(cmds).toHaveLength(1)
    expect(cmds[0].name).toBe('review')
    expect(cmds[0].prompt).toBe('Review the code. Focus on: {{args}}')
  })

  it('skips files with missing frontmatter fields', async () => {
    writeFileSync(join(tmpDir, 'bad.md'), `---
description: no name or trigger
---
body`)

    const loader = new SkillLoader([tmpDir])
    await loader.loadInto(registry)
    expect(registry.getAll()).toHaveLength(0)
  })

  it('silently skips non-existent directories and leaves registry empty', async () => {
    const missingDir = join(os.tmpdir(), `skill-nonexistent-${Date.now()}`)
    const loader = new SkillLoader([missingDir])
    await loader.loadInto(registry)
    expect(registry.getAll()).toHaveLength(0)
  })

  it('derives command name from trigger when name field is absent', async () => {
    writeFileSync(join(tmpDir, 'deploy.md'), `---
description: Deploy the app
trigger: /deploy
args: none
---

Run the deployment pipeline.`)

    const loader = new SkillLoader([tmpDir])
    await loader.loadInto(registry)

    const cmds = registry.getAll()
    expect(cmds).toHaveLength(1)
    expect(cmds[0].name).toBe('deploy')
  })

  it('loads from multiple directories, later dirs have higher priority', async () => {
    const dir2 = join(os.tmpdir(), `skill-test2-${Date.now()}`)
    mkdirSync(dir2, { recursive: true })

    writeFileSync(join(tmpDir, 'foo.md'), `---
name: foo
description: low priority
trigger: /foo
args: none
---
low`)
    writeFileSync(join(dir2, 'foo.md'), `---
name: foo
description: high priority
trigger: /foo
args: none
---
high`)

    const loader = new SkillLoader([tmpDir, dir2])
    await loader.loadInto(registry)

    const cmds = registry.getAll()
    expect(cmds).toHaveLength(1)
    expect(cmds[0].prompt).toBe('high')

    rmSync(dir2, { recursive: true, force: true })
  })
})
