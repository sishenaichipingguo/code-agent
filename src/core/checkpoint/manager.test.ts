import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { CheckpointManager } from './manager'

describe('CheckpointManager', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ckpt-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('restores prior content of a modified file', async () => {
    const file = join(dir, 'a.txt')
    writeFileSync(file, 'original')
    const mgr = new CheckpointManager()

    await mgr.snapshot('edit', [file])
    writeFileSync(file, 'changed')

    const result = await mgr.undo()
    expect(readFileSync(file, 'utf-8')).toBe('original')
    expect(result?.restored).toEqual([file])
  })

  it('deletes a file that did not exist before the change', async () => {
    const file = join(dir, 'new.txt')
    const mgr = new CheckpointManager()

    await mgr.snapshot('write', [file])
    writeFileSync(file, 'created by tool')

    const result = await mgr.undo()
    expect(existsSync(file)).toBe(false)
    expect(result?.deleted).toEqual([file])
  })

  it('returns null when there is nothing to undo', async () => {
    const mgr = new CheckpointManager()
    expect(await mgr.undo()).toBeNull()
  })

  it('undoes checkpoints in LIFO order', async () => {
    const file = join(dir, 'a.txt')
    writeFileSync(file, 'v0')
    const mgr = new CheckpointManager()

    await mgr.snapshot('first', [file])
    writeFileSync(file, 'v1')
    await mgr.snapshot('second', [file])
    writeFileSync(file, 'v2')

    await mgr.undo()
    expect(readFileSync(file, 'utf-8')).toBe('v1')
    await mgr.undo()
    expect(readFileSync(file, 'utf-8')).toBe('v0')
  })

  it('ignores empty path lists', async () => {
    const mgr = new CheckpointManager()
    await mgr.snapshot('noop', [])
    expect(mgr.count()).toBe(0)
  })
})
