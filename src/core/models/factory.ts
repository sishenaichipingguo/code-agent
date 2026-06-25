import type { ModelAdapter } from './adapter'
import type { ProviderConfig } from './types'
import { AnthropicAdapter } from './anthropic'
import { OllamaAdapter } from './ollama'
import { OpenAICompatibleAdapter } from './openai-compatible'

export class ModelFactory {
  static create(config: ProviderConfig): ModelAdapter {
    switch (config.type) {
      case 'anthropic':
        return new AnthropicAdapter({
          apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
          model: config.model,
          baseUrl: config.baseUrl || process.env.ANTHROPIC_BASE_URL,
        })

      case 'ollama':
        return new OllamaAdapter({
          baseUrl: config.baseUrl || 'http://localhost:11434',
          model: config.model,
        })

      case 'openai':
      case 'openai-compatible': {
        // 'openai' defaults to the official endpoint; 'openai-compatible'
        // expects an explicit baseUrl (local server / gateway), falling back
        // to OPENAI_BASE_URL then the official endpoint.
        const baseUrl =
          config.baseUrl ||
          process.env.OPENAI_BASE_URL ||
          'https://api.openai.com/v1'
        return new OpenAICompatibleAdapter({
          apiKey: config.apiKey || process.env.OPENAI_API_KEY || '',
          model: config.model,
          baseUrl,
        })
      }

      default:
        throw new Error(`Unknown provider: ${config.type}`)
    }
  }
}
