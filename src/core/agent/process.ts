// Model configuration shared across all agent backends
export interface SubAgentModelConfig {
  provider: string
  model: string
  apiKey?: string
  baseUrl?: string
  maxTokens?: number
}
