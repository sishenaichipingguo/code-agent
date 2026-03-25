// Model adapter interface
export interface ModelResponse {
  type: 'text' | 'tool_use' | 'error'
  content?: string
  tools?: any[]
  error?: string
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'done'
  content?: string
  tool?: any
}

export interface ModelAdapter {
  name: string
  chat(messages: any[], tools: any): Promise<ModelResponse>
  chatStream?(messages: any[], tools: any): AsyncGenerator<StreamChunk>
}
