// Worker Service 类型定义和接口契约
// 这些类型定义了 CLI 和 Worker 之间的通信协议

export type PlatformSource = 'claude-code' | 'cursor' | 'gemini-cli' | 'windsurf' | 'opencode'

export type ObservationType =
  | 'tool_call'
  | 'file_read'
  | 'file_write'
  | 'code_analysis'
  | 'error'
  | 'completed'

// ============ Session API ============

export interface SessionInitRequest {
  contentSessionId: string      // CLI 会话 ID
  project: string                // 项目名称
  prompt: string                 // 用户输入的 prompt
  platformSource: PlatformSource
  cwd?: string                   // 工作目录
}

export interface SessionInitResponse {
  sessionDbId: number            // Worker 数据库中的会话 ID
  promptNumber: number           // 当前 prompt 序号
  skipped?: boolean              // 是否被排除（私有项目等）
  reason?: string                // 排除原因
}

export interface ObservationRequest {
  contentSessionId: string
  toolName: string
  toolInput: Record<string, any>
  toolResponse: any
  timestamp?: number
}

export interface ObservationResponse {
  observationId: number
  queued: boolean
}

export interface SummarizeRequest {
  contentSessionId: string
  lastAssistantMessage: string
  timestamp?: number
}

export interface SummarizeResponse {
  summaryId: number
  queued: boolean
}

export interface SessionCompleteRequest {
  contentSessionId: string
}

export interface SessionCompleteResponse {
  success: boolean
}

export interface SessionStatusResponse {
  queueLength: number
  processing: boolean
  lastProcessedAt?: number
}

// ============ Data Models ============

export interface Session {
  id: number
  contentSessionId: string
  project: string
  platformSource: PlatformSource
  cwd: string
  createdAt: number
  updatedAt: number
  promptCount: number
}

export interface Observation {
  id: number
  sessionId: number
  type: ObservationType
  content: string
  metadata: Record<string, any>
  createdAt: number
}

export interface Summary {
  id: number
  sessionId: number
  content: string
  createdAt: number
}

export interface UserPrompt {
  id: number
  sessionId: number
  promptNumber: number
  content: string
  createdAt: number
}

// ============ Active Session (内存中的会话状态) ============

export interface ActiveSession {
  sessionDbId: number
  contentSessionId: string
  project: string
  cwd: string
  messageQueue: QueuedMessage[]
  processing: boolean
  lastProcessedAt?: number
}

export type QueuedMessage =
  | { type: 'init'; prompt: string; timestamp: number }
  | { type: 'observation'; toolName: string; toolInput: any; toolResponse: any; timestamp: number }
  | { type: 'summary'; lastAssistantMessage: string; timestamp: number }

// ============ SDKAgent Prompts ============

export interface InitPromptContext {
  userPrompt: string
  project: string
  cwd: string
}

export interface ContinuationPromptContext {
  toolName: string
  toolInput: any
  toolResponse: any
}

export interface SummaryPromptContext {
  lastAssistantMessage: string
}

// ============ Search API ============

export interface SearchRequest {
  query?: string
  project?: string
  startDate?: number
  endDate?: number
  type?: ObservationType
  limit?: number
  offset?: number
}

export interface SearchResponse {
  observations: Observation[]
  total: number
  fellBack?: boolean  // 是否降级到 SQLite 搜索
}

// ============ Semantic Context API ============

export interface SemanticContextRequest {
  query: string
  project: string
  limit?: number
}

export interface SemanticContextResponse {
  additionalContext: string
  observations: Observation[]
}
