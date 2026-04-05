import type { Tool } from './registry'
import { TaskManager } from '../tasks/manager'

let taskManager: TaskManager | null = null

export function initTaskManager(projectRoot: string) {
  taskManager = new TaskManager(projectRoot)
}

export function getTaskManager(): TaskManager {
  if (!taskManager) throw new Error('TaskManager not initialized')
  return taskManager
}

export class TaskCreateTool implements Tool {
  name = 'task_create'
  description = 'Create a new task'
  inputSchema = {
    type: 'object',
    properties: {
      subject: { type: 'string' },
      description: { type: 'string' },
      activeForm: { type: 'string' },
      metadata: { type: 'object' }
    },
    required: ['subject', 'description']
  }

  isConcurrencySafe = () => false
  isReadOnly = () => false
  isDestructive = () => false
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(input: any): Promise<string> {
    const task = getTaskManager().create(input)
    return `Task #${task.id} created: ${task.subject}`
  }
}

export class TaskUpdateTool implements Tool {
  name = 'task_update'
  description = 'Update an existing task'
  inputSchema = {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      subject: { type: 'string' },
      description: { type: 'string' },
      activeForm: { type: 'string' },
      status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'deleted'] },
      owner: { type: 'string' },
      addBlocks: { type: 'array', items: { type: 'string' } },
      addBlockedBy: { type: 'array', items: { type: 'string' } },
      metadata: { type: 'object' }
    },
    required: ['taskId']
  }

  isConcurrencySafe = () => false
  isReadOnly = () => false
  isDestructive = () => false
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(input: any): Promise<string> {
    const task = getTaskManager().update(input)
    return `Task #${task.id} updated: ${task.status}`
  }
}

export class TaskListTool implements Tool {
  name = 'task_list'
  description = 'List all tasks'
  inputSchema = { type: 'object', properties: {} }

  isConcurrencySafe = () => false
  isReadOnly = () => false
  isDestructive = () => false
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(): Promise<string> {
    const tasks = getTaskManager().list()
    if (tasks.length === 0) return 'No tasks found'

    return tasks.map(t =>
      `#${t.id}. [${t.status}] ${t.subject}${t.blockedBy.length ? ' (blocked)' : ''}`
    ).join('\n')
  }
}

export class TaskGetTool implements Tool {
  name = 'task_get'
  description = 'Get task details'
  inputSchema = {
    type: 'object',
    properties: { taskId: { type: 'string' } },
    required: ['taskId']
  }

  isConcurrencySafe = () => false
  isReadOnly = () => false
  isDestructive = () => false
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(input: any): Promise<string> {
    const task = getTaskManager().get(input.taskId)
    if (!task) return `Task ${input.taskId} not found`

    return `Task #${task.id}: ${task.subject}
Status: ${task.status}
Description: ${task.description}
Blocks: ${task.blocks.join(', ') || 'none'}
Blocked by: ${task.blockedBy.join(', ') || 'none'}`
  }
}
