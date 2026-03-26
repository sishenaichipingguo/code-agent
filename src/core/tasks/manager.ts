import type { Task, TaskCreateInput, TaskUpdateInput, TaskStatus } from './types'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export class TaskManager {
  private tasks: Map<string, Task> = new Map()
  private nextId = 1
  private storageDir: string

  constructor(projectRoot: string) {
    this.storageDir = join(projectRoot, '.claude', 'tasks')
    this.ensureStorageDir()
    this.load()
  }

  private ensureStorageDir() {
    if (!existsSync(this.storageDir)) {
      mkdirSync(this.storageDir, { recursive: true })
    }
  }

  private getStoragePath(): string {
    return join(this.storageDir, 'tasks.json')
  }

  private load() {
    const path = this.getStoragePath()
    if (existsSync(path)) {
      try {
        const data = JSON.parse(readFileSync(path, 'utf-8'))
        this.nextId = data.nextId || 1
        data.tasks?.forEach((t: any) => {
          this.tasks.set(t.id, {
            ...t,
            created: new Date(t.created),
            updated: new Date(t.updated)
          })
        })
      } catch (e) {
        console.error('Failed to load tasks:', e)
      }
    }
  }

  private save() {
    const data = {
      nextId: this.nextId,
      tasks: Array.from(this.tasks.values()),
      updated: new Date().toISOString()
    }
    writeFileSync(this.getStoragePath(), JSON.stringify(data, null, 2))
  }

  create(input: TaskCreateInput): Task {
    const task: Task = {
      id: String(this.nextId++),
      subject: input.subject,
      description: input.description,
      activeForm: input.activeForm,
      status: 'pending',
      blocks: [],
      blockedBy: [],
      metadata: input.metadata || {},
      created: new Date(),
      updated: new Date()
    }
    this.tasks.set(task.id, task)
    this.save()
    return task
  }

  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId)
  }

  list(): Task[] {
    return Array.from(this.tasks.values())
      .filter(t => t.status !== 'deleted')
      .sort((a, b) => parseInt(a.id) - parseInt(b.id))
  }

  update(input: TaskUpdateInput): Task {
    const task = this.tasks.get(input.taskId)
    if (!task) throw new Error(`Task ${input.taskId} not found`)

    if (input.subject !== undefined) task.subject = input.subject
    if (input.description !== undefined) task.description = input.description
    if (input.activeForm !== undefined) task.activeForm = input.activeForm
    if (input.status !== undefined) task.status = input.status
    if (input.owner !== undefined) task.owner = input.owner

    if (input.addBlocks) {
      input.addBlocks.forEach(id => {
        if (!task.blocks.includes(id)) task.blocks.push(id)
      })
    }

    if (input.addBlockedBy) {
      input.addBlockedBy.forEach(id => {
        if (!task.blockedBy.includes(id)) task.blockedBy.push(id)
      })
    }

    if (input.metadata) {
      task.metadata = { ...task.metadata, ...input.metadata }
    }

    task.updated = new Date()
    this.save()
    return task
  }
}
