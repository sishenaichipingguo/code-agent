export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'deleted'

export interface Task {
  id: string
  subject: string
  description: string
  activeForm?: string
  status: TaskStatus
  owner?: string
  blocks: string[]
  blockedBy: string[]
  metadata: Record<string, any>
  created: Date
  updated: Date
}

export interface TaskCreateInput {
  subject: string
  description: string
  activeForm?: string
  metadata?: Record<string, any>
}

export interface TaskUpdateInput {
  taskId: string
  subject?: string
  description?: string
  activeForm?: string
  status?: TaskStatus
  owner?: string
  addBlocks?: string[]
  addBlockedBy?: string[]
  metadata?: Record<string, any>
}
