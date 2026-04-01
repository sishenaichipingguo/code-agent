import type { UnifiedRequest, UnifiedResponse, StreamChunk, ModelCapabilities } from './types'

export interface ModelAdapter {
  name: string
  capabilities: ModelCapabilities
  chat(request: UnifiedRequest, toolRegistry: any): Promise<UnifiedResponse>
  chatStream?(request: UnifiedRequest, toolRegistry: any): AsyncGenerator<StreamChunk>
}

// Legacy exports for compatibility
export type { UnifiedResponse as ModelResponse, StreamChunk }
