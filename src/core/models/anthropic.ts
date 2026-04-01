import Anthropic from '@anthropic-ai/sdk'
import type { ModelAdapter, UnifiedRequest, UnifiedResponse, StreamChunk, ModelCapabilities } from './types'
import { getTokenTracker } from '@/infra/token-tracker'
import { getLogger } from '@/infra/logger'
import { withRetry } from '@/infra/errors'

interface Config {
  apiKey: string
  model: string
}

export class AnthropicAdapter implements ModelAdapter {
  name = 'anthropic'
  capabilities: ModelCapabilities = {
    tools: true,
    streaming: true,
    vision: true
  }
  private client: Anthropic

  constructor(private config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey
    })
  }

  async chat(request: UnifiedRequest, toolRegistry: any): Promise<UnifiedResponse> {
    const logger = getLogger()
    const tracker = getTokenTracker()

    return withRetry(
      async () => {
        logger.debug('API call started')

        const tools = toolRegistry.toSchema()
        const response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: request.max_tokens || 4096,
          messages: request.messages as any,
          tools,
          system: [
            {
              type: 'text',
              text: request.system ?? this.defaultSystemPrompt(),
              cache_control: { type: 'ephemeral' }
            }
          ] as any
        })

        const inputTokens = response.usage.input_tokens
        const outputTokens = response.usage.output_tokens
        const cacheCreation = (response.usage as any).cache_creation_input_tokens ?? 0
        const cacheRead = (response.usage as any).cache_read_input_tokens ?? 0

        tracker.track(this.config.model, inputTokens, outputTokens, cacheCreation, cacheRead)

        logger.debug('API call completed', {
          tokens: inputTokens + outputTokens,
          cacheCreation,
          cacheRead
        })

        // Handle tool use first (stop_reason is authoritative)
        const toolCalls = response.content.filter((c: any) => c.type === 'tool_use')
        if (response.stop_reason === 'tool_use' && toolCalls.length > 0) {
          return {
            type: 'tool_use',
            tools: toolCalls,
            rawContent: response.content,
            inputTokens
          }
        }

        // Handle text response
        const textContent = response.content.find((c: any) => c.type === 'text')
        if (textContent) {
          return {
            type: 'text',
            content: textContent.text,
            rawContent: response.content,
            inputTokens
          }
        }

        return {
          type: 'text',
          content: 'No response',
          rawContent: response.content,
          inputTokens
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

  private defaultSystemPrompt(): string {
    return `You are a coding assistant. Use tools to complete tasks efficiently.
Current directory: ${process.cwd()}
Available tools: bash, read, write, edit, glob, grep, ls, cp, mv, rm`
  }

  async *chatStream(request: UnifiedRequest, toolRegistry: any): AsyncGenerator<StreamChunk> {
    const logger = getLogger()
    const tracker = getTokenTracker()

    try {
      logger.debug('Streaming API call started')

      const tools = toolRegistry.toSchema()
      const stream = await this.client.messages.stream({
        model: this.config.model,
        max_tokens: request.max_tokens || 4096,
        messages: request.messages as any,
        tools,
        system: [
          {
            type: 'text',
            text: request.system ?? this.defaultSystemPrompt(),
            cache_control: { type: 'ephemeral' }
          }
        ] as any
      })

      let inputTokens = 0
      let outputTokens = 0
      let cacheCreation = 0
      let cacheRead = 0
      // Map from block index to accumulated input JSON string
      const toolInputBuffers = new Map<number, string>()
      // Map from block index to partial tool block (id, name)
      const toolBlocks = new Map<number, any>()

      for await (const event of stream) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage.input_tokens
          cacheCreation = (event.message.usage as any).cache_creation_input_tokens ?? 0
          cacheRead = (event.message.usage as any).cache_read_input_tokens ?? 0
        }

        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            toolBlocks.set(event.index, { ...event.content_block, input: {} })
            toolInputBuffers.set(event.index, '')
            yield { type: 'tool_use', tool: toolBlocks.get(event.index), toolIndex: event.index }
          }
        }

        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', content: event.delta.text }
          } else if (event.delta.type === 'input_json_delta') {
            const buf = (toolInputBuffers.get(event.index) ?? '') + event.delta.partial_json
            toolInputBuffers.set(event.index, buf)
            yield { type: 'tool_input_delta', toolIndex: event.index, inputDelta: event.delta.partial_json }
          }
        }

        if (event.type === 'content_block_stop') {
          const block = toolBlocks.get(event.index)
          if (block) {
            const inputStr = toolInputBuffers.get(event.index) ?? '{}'
            try {
              block.input = JSON.parse(inputStr)
            } catch {
              block.input = {}
            }
            // Re-yield the completed tool block with full input
            yield { type: 'tool_use', tool: block, toolIndex: event.index }
          }
        }

        if (event.type === 'message_delta') {
          outputTokens = event.usage.output_tokens
        }

        if (event.type === 'message_stop') {
          tracker.track(this.config.model, inputTokens, outputTokens, cacheCreation, cacheRead)
          logger.debug('Streaming API call completed', {
            tokens: inputTokens + outputTokens,
            cacheCreation,
            cacheRead
          })
          yield { type: 'done', inputTokens }
        }
      }
    } catch (error: any) {
      logger.error('Streaming API call failed', { error: error.message })
      throw error
    }
  }
}
