import Anthropic from '@anthropic-ai/sdk'
import type { ModelAdapter, ModelResponse, StreamChunk } from './adapter'
import { getTokenTracker } from '@/infra/token-tracker'
import { getLogger } from '@/infra/logger'
import { withRetry } from '@/infra/errors'

interface Config {
  apiKey: string
  model: string
}

export class AnthropicAdapter implements ModelAdapter {
  name = 'anthropic'
  private client: Anthropic

  constructor(private config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey
    })
  }

  async chat(messages: any[], toolRegistry: any): Promise<ModelResponse> {
    const logger = getLogger()
    const tracker = getTokenTracker()

    return withRetry(
      async () => {
        logger.debug('API call started')

        const tools = toolRegistry.toSchema()
        const response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: 4096,
          messages,
          tools,
          system: this.buildSystemPrompt()
        })

        // Track token usage
        tracker.track(
          this.config.model,
          response.usage.input_tokens,
          response.usage.output_tokens
        )

        logger.debug('API call completed', {
          tokens: response.usage.input_tokens + response.usage.output_tokens
        })

        // Handle text response
        const textContent = response.content.find((c: any) => c.type === 'text')
        if (textContent && response.stop_reason !== 'tool_use') {
          return {
            type: 'text',
            content: textContent.text
          }
        }

        // Handle tool use
        const toolCalls = response.content.filter((c: any) => c.type === 'tool_use')
        if (toolCalls.length > 0) {
          return {
            type: 'tool_use',
            tools: toolCalls
          }
        }

        return {
          type: 'text',
          content: 'No response'
        }
      },
      {
        maxRetries: 3,
        onRetry: (attempt, error) => {
          logger.warn(`API call failed, retrying (${attempt}/3)`, {
            error: error.message
          })
        }
      }
    ).catch((error: any) => {
      const { AgentError, ErrorCode } = require('@/infra/errors')

      let errorCode = ErrorCode.API_ERROR
      if (error.message?.includes('network')) {
        errorCode = ErrorCode.NETWORK_ERROR
      } else if (error.status === 429) {
        errorCode = ErrorCode.RATE_LIMIT
      }

      const agentError = new AgentError(errorCode, error.message, {}, true)

      return {
        type: 'error',
        error: agentError.toUserMessage()
      }
    })
  }

  private buildSystemPrompt(): string {
    return `You are a coding assistant. Use tools to complete tasks efficiently.
Current directory: ${process.cwd()}
Available tools: bash, read, write, edit, glob, grep, ls, cp, mv, rm`
  }

  async *chatStream(messages: any[], toolRegistry: any): AsyncGenerator<StreamChunk> {
    const logger = getLogger()
    const tracker = getTokenTracker()

    try {
      logger.debug('Streaming API call started')

      const tools = toolRegistry.toSchema()
      const stream = await this.client.messages.stream({
        model: this.config.model,
        max_tokens: 4096,
        messages,
        tools,
        system: this.buildSystemPrompt()
      })

      let inputTokens = 0
      let outputTokens = 0

      for await (const event of stream) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens
        }

        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', content: event.delta.text }
          }
        }

        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            yield { type: 'tool_use', tool: event.content_block }
          }
        }

        if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens
        }

        if (event.type === 'message_stop') {
          tracker.track(this.config.model, inputTokens, outputTokens)
          logger.debug('Streaming API call completed', {
            tokens: inputTokens + outputTokens
          })
          yield { type: 'done' }
        }
      }
    } catch (error: any) {
      logger.error('Streaming API call failed', { error: error.message })
      throw error
    }
  }
}
