import type { Tool } from './registry'
import { MemoryManager } from '../memory/manager'

let memoryManager: MemoryManager | null = null

export function initMemoryManager(projectRoot: string) {
  memoryManager = new MemoryManager(projectRoot)
}

export function getMemoryManager(): MemoryManager {
  if (!memoryManager) throw new Error('MemoryManager not initialized')
  return memoryManager
}

export class MemorySaveTool implements Tool {
  name = 'memory_save'
  description = 'Save a memory (user/feedback/project/reference)'
  inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'] },
      content: { type: 'string' }
    },
    required: ['name', 'description', 'type', 'content']
  }

  isConcurrencySafe = () => false
  isReadOnly = () => false
  isDestructive = () => false
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(input: any): Promise<string> {
    const memory = getMemoryManager().save(input)
    return `Memory saved: ${memory.name} (${memory.type})`
  }
}

export class MemoryLoadTool implements Tool {
  name = 'memory_load'
  description = 'Load memory index'
  inputSchema = { type: 'object', properties: {} }

  isConcurrencySafe = () => true
  isReadOnly = () => true
  isDestructive = () => false
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(): Promise<string> {
    return getMemoryManager().loadIndex()
  }
}

export class MemoryUpdateTool implements Tool {
  name = 'memory_update'
  description = 'Update an existing memory entry (overwrites content and description)'
  inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string' },
      type: { type: 'string', enum: ['user', 'feedback', 'project', 'reference'] },
      content: { type: 'string' }
    },
    required: ['name', 'description', 'type', 'content']
  }

  isConcurrencySafe = () => false
  isReadOnly = () => false
  isDestructive = () => false
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(input: any): Promise<string> {
    const memory = getMemoryManager().update(input)
    return `Memory updated: ${memory.name} (${memory.type})`
  }
}

export class MemoryDeleteTool implements Tool {
  name = 'memory_delete'
  description = 'Delete a memory entry by name'
  inputSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Exact name of the memory to delete' }
    },
    required: ['name']
  }

  isConcurrencySafe = () => false
  isReadOnly = () => false
  isDestructive = () => true
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(input: any): Promise<string> {
    getMemoryManager().delete(input.name)
    return `Memory deleted: ${input.name}`
  }
}
