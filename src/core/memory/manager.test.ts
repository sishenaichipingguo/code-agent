import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { MemoryManager } from './manager'

let tmpDir: string
let mgr: MemoryManager

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'memory-test-'))
  mgr = new MemoryManager(tmpDir)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('MemoryManager.save', () => {
  it('creates a file and adds entry to index', () => {
    const m = mgr.save({ name: 'test', description: 'desc', type: 'user', content: 'hello' })
    expect(m.name).toBe('test')
    const index = mgr.loadIndex()
    expect(index).toContain('[test]')
  })
})

describe('MemoryManager.update', () => {
  it('overwrites content and updates the index description', () => {
    mgr.save({ name: 'pref', description: 'old desc', type: 'feedback', content: 'old' })
    const updated = mgr.update({ name: 'pref', description: 'new desc', type: 'feedback', content: 'new' })
    expect(updated.content).toBe('new')
    expect(mgr.loadIndex()).toContain('new desc')
    expect(mgr.loadIndex()).not.toContain('old desc')
  })

  it('throws when memory does not exist', () => {
    expect(() => mgr.update({ name: 'missing', description: '', type: 'user', content: '' }))
      .toThrow('Memory not found: missing')
  })
})

describe('MemoryManager.delete', () => {
  it('removes file and removes entry from index', () => {
    mgr.save({ name: 'to-del', description: 'x', type: 'project', content: 'y' })
    mgr.delete('to-del')
    expect(mgr.loadIndex()).not.toContain('[to-del]')
  })

  it('throws when memory does not exist', () => {
    expect(() => mgr.delete('nope')).toThrow('Memory not found: nope')
  })
})
