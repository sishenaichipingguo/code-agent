export type MemoryType = 'user' | 'feedback' | 'project' | 'reference'

export interface Memory {
  name: string
  description: string
  type: MemoryType
  content: string
  created: Date
  updated: Date
  filePath: string
}

export interface MemoryCreateInput {
  name: string
  description: string
  type: MemoryType
  content: string
}
