import type { ModelAdapter } from './adapter'
import type { ProviderConfig } from './types'
import { AnthropicAdapter } from './anthropic'
import { OllamaAdapter } from './ollama'

export class ModelFactory {
  static create(config: ProviderConfig): ModelAdapter {
    switch (config.type) {
      case 'anthropic':
        return new AnthropicAdapter({
          apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
          model: config.model,
          baseUrl: config.baseUrl || process.env.ANTHROPIC_BASE_URL
        })

      case 'ollama':
        return new OllamaAdapter({
          baseUrl: config.baseUrl || 'http://localhost:11434',
          model: config.model
        })

      case 'openai':
      case 'openai-compatible':
        throw new Error(`${config.type} not yet implemented`)

      default:
        throw new Error(`Unknown provider: ${config.type}`)
    }
  }
}
