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

  isConcurrencySafe = () => false
  isReadOnly = () => false
  isDestructive = () => false
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(): Promise<string> {
    return getMemoryManager().loadIndex()
  }
}
