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

describe('MemoryManager namespace isolation', () => {
  it('writes to namespaced subdirectory when MEMORY_NAMESPACE is set', () => {
    process.env.MEMORY_NAMESPACE = 'sub-test-001'
    const nsManager = new MemoryManager(tmpDir)
    nsManager.save({ name: 'ns-fact', description: 'd', type: 'project', content: 'c' })
    delete process.env.MEMORY_NAMESPACE

    const { existsSync } = require('fs')
    const { join } = require('path')
    expect(existsSync(join(tmpDir, '.claude', 'memory', 'sub-test-001', 'project_ns-fact.md'))).toBe(true)
  })

  it('loadIndex() always reads from root MEMORY.md regardless of namespace', () => {
    // Root manager saves a memory (no namespace)
    const rootManager = new MemoryManager(tmpDir)
    rootManager.save({ name: 'root-fact', description: 'd', type: 'user', content: 'c' })

    // Namespaced manager should still see the root index
    process.env.MEMORY_NAMESPACE = 'sub-test-002'
    const nsManager = new MemoryManager(tmpDir)
    expect(nsManager.loadIndex()).toContain('root-fact')
    delete process.env.MEMORY_NAMESPACE
  })
})
