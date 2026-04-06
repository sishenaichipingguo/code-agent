import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { AutoExtractor } from './auto-extractor'
import { MemoryManager } from './manager'

let tmpDir: string
let mgr: MemoryManager

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'auto-extractor-test-'))
  mgr = new MemoryManager(tmpDir)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

const extracted = JSON.stringify([
  { name: 'prefers-bun', description: 'user prefers Bun over Node', type: 'user', content: 'Uses Bun for all TS projects.' }
])

const mockModelExtracts = {
  name: 'claude-sonnet-4',
  capabilities: { tools: false, streaming: false, vision: false },
  chat: mock(async () => ({ type: 'text' as const, content: extracted }))
}

const mockModelEmpty = {
  name: 'claude-sonnet-4',
  capabilities: { tools: false, streaming: false, vision: false },
  chat: mock(async () => ({ type: 'text' as const, content: '[]' }))
}

describe('AutoExtractor', () => {
  it('saves extracted memories to MemoryManager', async () => {
    const extractor = new AutoExtractor(mgr, mockModelExtracts as any)
    const messages = [
      { role: 'user' as const, content: 'I always use Bun not Node' },
      { role: 'assistant' as const, content: 'Noted, using Bun.' }
    ]
    await extractor.extract(messages)
    expect(mgr.loadIndex()).toContain('prefers-bun')
  })

  it('skips already-known memories (dedup by name)', async () => {
    mgr.save({ name: 'prefers-bun', description: 'existing', type: 'user', content: 'exists' })
    const extractor = new AutoExtractor(mgr, mockModelExtracts as any)
    const messages = [
      { role: 'user' as const, content: 'I always use Bun' },
      { role: 'assistant' as const, content: 'Yes.' }
    ]
    await extractor.extract(messages)
    // Should NOT have duplicated the entry — count link-text occurrences only
    const index = mgr.loadIndex()
    const count = (index.match(/\[prefers-bun\]/g) ?? []).length
    expect(count).toBe(1)
  })

  it('is a no-op when model returns empty array', async () => {
    const extractor = new AutoExtractor(mgr, mockModelEmpty as any)
    await extractor.extract([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hey' }])
    expect(mgr.loadIndex()).not.toContain('[')
  })
})
