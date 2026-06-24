import { readFile, writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname } from 'path'

/** One file's prior state. `before === null` means the file did not exist. */
interface CheckpointEntry {
  path: string
  before: string | null
}

export interface Checkpoint {
  id: number
  label: string
  timestamp: number
  entries: CheckpointEntry[]
}

export interface UndoResult {
  label: string
  restored: string[]
  deleted: string[]
}

const MAX_CHECKPOINTS = 50

/**
 * Snapshot-based undo layer. Before a mutating tool runs, the affected files'
 * contents are captured so the change can be reversed later — works in any
 * directory, no git repository required.
 */
export class CheckpointManager {
  private checkpoints: Checkpoint[] = []
  private nextId = 1

  /** Capture the current contents of `paths` as a single undoable checkpoint. */
  async snapshot(label: string, paths: string[]): Promise<void> {
    const unique = [...new Set(paths.filter(Boolean))]
    if (unique.length === 0) return

    const entries: CheckpointEntry[] = []
    for (const path of unique) {
      let before: string | null = null
      if (existsSync(path)) {
        try {
          before = await readFile(path, 'utf-8')
        } catch {
          before = null
        }
      }
      entries.push({ path, before })
    }

    this.checkpoints.push({
      id: this.nextId++,
      label,
      timestamp: Date.now(),
      entries,
    })
    if (this.checkpoints.length > MAX_CHECKPOINTS) this.checkpoints.shift()
  }

  /** Restore the most recent checkpoint. Returns null when there is nothing to undo. */
  async undo(): Promise<UndoResult | null> {
    const checkpoint = this.checkpoints.pop()
    if (!checkpoint) return null

    const restored: string[] = []
    const deleted: string[] = []
    for (const entry of checkpoint.entries) {
      if (entry.before === null) {
        // File was absent before the change → remove it if it now exists.
        if (existsSync(entry.path)) {
          await unlink(entry.path)
          deleted.push(entry.path)
        }
      } else {
        await mkdir(dirname(entry.path), { recursive: true })
        await writeFile(entry.path, entry.before, 'utf-8')
        restored.push(entry.path)
      }
    }
    return { label: checkpoint.label, restored, deleted }
  }

  list(): Checkpoint[] {
    return [...this.checkpoints]
  }

  count(): number {
    return this.checkpoints.length
  }

  clear(): void {
    this.checkpoints = []
  }
}

let instance: CheckpointManager | null = null

export function getCheckpointManager(): CheckpointManager {
  if (!instance) instance = new CheckpointManager()
  return instance
}
