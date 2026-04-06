import { describe, it, expect } from 'bun:test'
import { SlashCommandRegistry } from '@/core/slash/registry'
import { SkillLoader } from '@/core/slash/skill-loader'
import { makeHelpHandler } from '@/core/slash/builtins/help'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import os from 'os'
import type { CommandContext } from '@/core/slash/types'

const mockCtx = {} as CommandContext

describe('slash command integration', () => {
  it('/help output includes all registered commands', async () => {
    const registry = new SlashCommandRegistry()
    registry.register({ name: 'compact', description: 'Compress context', args: 'none', handler: async () => ({ type: 'handled' }) }, -1)
    registry.register({ name: 'cost', description: 'Show cost', args: 'none', handler: async () => ({ type: 'handled' }) }, -1)
    registry.register({ name: 'help', description: 'List commands', args: 'none', handler: makeHelpHandler(registry) }, -1)

    const lines: string[] = []
    const origWrite = process.stderr.write.bind(process.stderr)
    ;(process.stderr as any).write = (s: string) => { lines.push(s); return true }

    await registry.dispatch('/help', mockCtx)

    ;(process.stderr as any).write = origWrite

    const output = lines.join('')
    expect(output).toContain('/compact')
    expect(output).toContain('/cost')
    expect(output).toContain('/help')
  })

  it('skill loaded from directory is dispatched as inject', async () => {
    const tmpDir = join(os.tmpdir(), `slash-int-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(join(tmpDir, 'review.md'), `---
name: review
description: Review code
trigger: /review
args: optional
---
Review the staged changes. Focus on: {{args}}`)

    const registry = new SlashCommandRegistry()
    const loader = new SkillLoader([tmpDir])
    await loader.loadInto(registry)

    const result = await registry.dispatch('/review security', mockCtx)
    expect(result.type).toBe('inject')
    if (result.type === 'inject') {
      expect(result.message).toContain('security')
    }

    rmSync(tmpDir, { recursive: true, force: true })
  })
})
