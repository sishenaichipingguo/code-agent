import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SessionStore } from './session-store'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'session-store-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

const mockModel = {
  name: 'claude-sonnet-4-6',
  capabilities: { tools: false, streaming: false, vision: false },
  chat: mock(async () => ({ type: 'text' as const, content: 'Session dealt with TypeScript refactoring.' }))
}

describe('SessionStore', () => {
  it('save() creates session_summary.md in memory dir', async () => {
    const store = new SessionStore(tmpDir, mockModel as any)
    const messages = [
      { role: 'user' as const, content: 'Refactor this module' },
      { role: 'assistant' as const, content: 'Done.' }
    ]
    await store.save(messages)
    expect(existsSync(join(tmpDir, '.claude', 'memory', 'session_summary.md'))).toBe(true)
  })

  it('load() returns empty string when no summary exists', () => {
    const store = new SessionStore(tmpDir, mockModel as any)
    expect(store.load()).toBe('')
  })

  it('load() returns summary content after save()', async () => {
    const store = new SessionStore(tmpDir, mockModel as any)
    await store.save([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }])
    const content = store.load()
    expect(content).toContain('Session dealt with')
  })

  it('save() is a no-op when fewer than 2 messages', async () => {
    const store = new SessionStore(tmpDir, mockModel as any)
    await store.save([{ role: 'user', content: 'hi' }])
    expect(existsSync(join(tmpDir, '.claude', 'memory', 'session_summary.md'))).toBe(false)
  })
})
