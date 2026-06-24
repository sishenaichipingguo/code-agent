import Anthropic from '@anthropic-ai/sdk'
import type {
  ModelAdapter,
  UnifiedRequest,
  UnifiedResponse,
  StreamChunk,
  ModelCapabilities,
} from './types'
import { getTokenTracker } from '@/infra/token-tracker'
import { getLogger } from '@/infra/logger'
import { withRetry, AgentError, ErrorCode } from '@/infra/errors'

interface Config {
  apiKey: string
  model: string
  baseUrl?: string
}

export class AnthropicAdapter implements ModelAdapter {
  name = 'anthropic'
  capabilities: ModelCapabilities = {
    tools: true,
    streaming: true,
    vision: true,
  }
  private client: Anthropic

  constructor(private config: Config) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl && { baseURL: config.baseUrl }),
    })
  }

  async chat(
    request: UnifiedRequest,
    toolRegistry: any
  ): Promise<UnifiedResponse> {
    const logger = getLogger()
    const tracker = getTokenTracker()

    return withRetry(
      async (): Promise<UnifiedResponse> => {
        logger.debug('API call started')

        const tools = this.cacheTools(toolRegistry.toSchema())
        const response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: request.max_tokens || 4096,
          messages: this.cacheLastMessage(request.messages as any[]) as any,
          tools,
          system: [
            {
              type: 'text',
              text: request.system ?? this.defaultSystemPrompt(),
              cache_control: { type: 'ephemeral' },
            },
          ] as any,
        })

        const inputTokens = response.usage.input_tokens
        const outputTokens = response.usage.output_tokens
        const cacheCreation =
          (response.usage as any).cache_creation_input_tokens ?? 0
        const cacheRead = (response.usage as any).cache_read_input_tokens ?? 0
        // True context size for compression decisions: input_tokens excludes
        // cached tokens, which still occupy the context window.
        const contextTokens = inputTokens + cacheCreation + cacheRead

        tracker.track(
          this.config.model,
          inputTokens,
          outputTokens,
          cacheCreation,
          cacheRead
        )

        logger.debug('API call completed', {
          tokens: inputTokens + outputTokens,
          cacheCreation,
          cacheRead,
        })

        // Handle tool use first (stop_reason is authoritative)
        const toolCalls = response.content.filter(
          (c: any) => c.type === 'tool_use'
        )
        if (response.stop_reason === 'tool_use' && toolCalls.length > 0) {
          return {
            type: 'tool_use',
            tools: toolCalls,
            rawContent: response.content,
            inputTokens: contextTokens,
          }
        }

        // Handle text response
        const textContent = response.content.find(
          (c): c is Anthropic.Messages.TextBlock => c.type === 'text'
        )
        if (textContent) {
          return {
            type: 'text',
            content: textContent.text,
            rawContent: response.content,
            inputTokens: contextTokens,
          }
        }

        return {
          type: 'text',
          content: 'No response',
          rawContent: response.content,
          inputTokens,
        }
      },
      {
        maxRetries: 3,
        onRetry: (attempt, error) => {
          logger.warn(`API call failed, retrying (${attempt}/3)`, {
            error: error.message,
          })
        },
      }
    ).catch((error: any) => {
      let errorCode = ErrorCode.API_ERROR
      if (error.message?.includes('network')) {
        errorCode = ErrorCode.NETWORK_ERROR
      } else if (error.status === 429) {
        errorCode = ErrorCode.RATE_LIMIT
      }

      const agentError = new AgentError(errorCode, error.message, {}, true)

      return {
        type: 'error',
        error: agentError.toUserMessage(),
      }
    })
  }

  private defaultSystemPrompt(): string {
    return `You are a coding assistant. Use tools to complete tasks efficiently.
Current directory: ${process.cwd()}
Available tools: bash, read, write, edit, glob, grep, ls, cp, mv, rm`
  }

  /** Mark the last tool definition as a cache breakpoint so the (stable) tool
   * schema is reused across turns instead of being re-billed every request. */
  private cacheTools(tools: any[]): any[] {
    if (tools.length === 0) return tools
    const last = tools[tools.length - 1]
    return [
      ...tools.slice(0, -1),
      { ...last, cache_control: { type: 'ephemeral' } },
    ]
  }

  /** Place a cache breakpoint at the end of the conversation. Each turn the
   * previous breakpoint becomes a cache read, so the growing history is billed
   * incrementally instead of in full on every request. */
  private cacheLastMessage(messages: any[]): any[] {
    if (messages.length === 0) return messages
    const last = messages[messages.length - 1]
    let content: any
    if (typeof last.content === 'string') {
      content = [
        {
          type: 'text',
          text: last.content,
          cache_control: { type: 'ephemeral' },
        },
      ]
    } else if (Array.isArray(last.content) && last.content.length > 0) {
      content = last.content.map((block: any, i: number) =>
        i === last.content.length - 1
          ? { ...block, cache_control: { type: 'ephemeral' } }
          : block
      )
    } else {
      return messages
    }
    return [...messages.slice(0, -1), { ...last, content }]
  }

  async *chatStream(
    request: UnifiedRequest,
    toolRegistry: any
  ): AsyncGenerator<StreamChunk> {
    const logger = getLogger()
    const tracker = getTokenTracker()

    try {
      logger.debug('Streaming API call started')

      const tools = this.cacheTools(toolRegistry.toSchema())
      const stream = await this.client.messages.stream({
        model: this.config.model,
        max_tokens: request.max_tokens || 4096,
        messages: this.cacheLastMessage(request.messages as any[]) as any,
        tools,
        system: [
          {
            type: 'text',
            text: request.system ?? this.defaultSystemPrompt(),
            cache_control: { type: 'ephemeral' },
          },
        ] as any,
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
          cacheCreation =
            (event.message.usage as any).cache_creation_input_tokens ?? 0
          cacheRead = (event.message.usage as any).cache_read_input_tokens ?? 0
        }

        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            toolBlocks.set(event.index, { ...event.content_block, input: {} })
            toolInputBuffers.set(event.index, '')
            yield {
              type: 'tool_use',
              tool: toolBlocks.get(event.index),
              toolIndex: event.index,
            }
          }
        }

        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'text', content: event.delta.text }
          } else if (event.delta.type === 'input_json_delta') {
            const buf =
              (toolInputBuffers.get(event.index) ?? '') +
              event.delta.partial_json
            toolInputBuffers.set(event.index, buf)
            yield {
              type: 'tool_input_delta',
              toolIndex: event.index,
              inputDelta: event.delta.partial_json,
            }
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
          tracker.track(
            this.config.model,
            inputTokens,
            outputTokens,
            cacheCreation,
            cacheRead
          )
          logger.debug('Streaming API call completed', {
            tokens: inputTokens + outputTokens,
            cacheCreation,
            cacheRead,
          })
          yield {
            type: 'done',
            inputTokens: inputTokens + cacheCreation + cacheRead,
          }
        }
      }
    } catch (error: any) {
      logger.error('Streaming API call failed', { error: error.message })
      const httpStatus = error?.status ?? error?.statusCode
      let errorCode = ErrorCode.API_ERROR
      if (httpStatus === 429) errorCode = ErrorCode.RATE_LIMIT
      else if (error.message?.includes('network'))
        errorCode = ErrorCode.NETWORK_ERROR
      throw new AgentError(errorCode, error.message, {}, true)
    }
  }
}
