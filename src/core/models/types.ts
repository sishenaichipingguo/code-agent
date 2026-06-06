// Unified message format
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ContentPart[]
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface Tool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

// A single content block in an assistant/user message (Anthropic-style).
export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: unknown
}

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | { type: string; [key: string]: unknown }

// Unified request/response
export interface UnifiedRequest {
  model: string
  messages: Message[]
  tools?: Tool[]
  max_tokens?: number
  temperature?: number
  stream?: boolean
  system?: string // pre-built system prompt; adapter uses this instead of its own default
}

export interface UnifiedResponse {
  type: 'text' | 'tool_use' | 'error'
  content?: string
  tools?: ToolUseBlock[]
  rawContent?: ContentBlock[] // full content block array for rebuilding assistant message
  inputTokens?: number // actual input tokens from this API call, for context management
  error?: string
}

// Context window limits per model (used for compression threshold)
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4': 200_000,
  'claude-sonnet-4-6': 200_000,
  'claude-haiku-4': 200_000,
  'claude-opus-4-5': 200_000,
  'claude-sonnet-4-5': 200_000,
}

export interface StreamChunk {
  type: 'text' | 'tool_use' | 'tool_input_delta' | 'done'
  content?: string
  tool?: ToolUseBlock
  toolIndex?: number // index for matching input_json_delta to tool block
  inputDelta?: string // incremental JSON string from input_json_delta
  inputTokens?: number // carried on 'done' chunk for context management
}

// Provider configuration
export interface ProviderConfig {
  type: 'anthropic' | 'ollama' | 'openai' | 'openai-compatible'
  baseUrl?: string
  apiKey?: string
  model: string
}

export interface ModelCapabilities {
  tools: boolean
  streaming: boolean
  vision: boolean
}

// A single tool definition as sent to the model API.
export interface ToolSchema {
  name: string
  description: string
  input_schema: unknown
}

// Minimal structural type for what model adapters need from a tool registry.
// Avoids a circular import on the concrete ToolRegistry class.
export interface ToolSchemaProvider {
  toSchema(): ToolSchema[]
}

// Unified interface implemented by every model provider adapter.
export interface ModelAdapter {
  name: string
  capabilities: ModelCapabilities
  chat(
    request: UnifiedRequest,
    toolRegistry: ToolSchemaProvider
  ): Promise<UnifiedResponse>
  chatStream?(
    request: UnifiedRequest,
    toolRegistry: ToolSchemaProvider
  ): AsyncGenerator<StreamChunk>
}
