import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { TeamStore } from './team-store'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'team-store-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('TeamStore', () => {
  it('save() creates file in teamDir and updates team MEMORY.md', () => {
    const teamDir = join(tmpDir, 'team')
    const store = new TeamStore(teamDir)
    store.save({ name: 'shared-rule', description: 'team uses tabs', type: 'feedback', content: 'Use tabs.' })
    expect(existsSync(join(teamDir, 'feedback_shared-rule.md'))).toBe(true)
    expect(store.loadIndex()).toContain('[shared-rule]')
  })

  it('loadIndex() returns empty string when teamDir does not exist', () => {
    const store = new TeamStore(join(tmpDir, 'nonexistent'))
    expect(store.loadIndex()).toBe('')
  })

  it('save() and load() round-trip correctly', () => {
    const teamDir = join(tmpDir, 'team')
    const store = new TeamStore(teamDir)
    store.save({ name: 'style', description: 'coding style', type: 'feedback', content: 'No semicolons.' })
    expect(store.loadIndex()).toContain('No semicolons')
  })
})
