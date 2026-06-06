import type {
  ModelAdapter,
  UnifiedRequest,
  UnifiedResponse,
  StreamChunk,
  ModelCapabilities,
  ToolSchemaProvider,
  Message,
  ContentBlock,
  TextBlock,
  ToolResultBlock,
} from './types'
import { getLogger } from '@/infra/logger'

interface Config {
  baseUrl: string
  model: string
}

interface OllamaToolCall {
  function: {
    name: string
    arguments: string | Record<string, unknown>
  }
}

interface OllamaChatBody {
  model: string
  messages: Array<{ role: string; content: string }>
  stream: boolean
  options: Record<string, unknown>
  tools?: unknown[]
}

export class OllamaAdapter implements ModelAdapter {
  name = 'ollama'
  capabilities: ModelCapabilities = {
    tools: true,
    streaming: true,
    vision: false,
  }

  constructor(private config: Config) {}

  async chat(
    request: UnifiedRequest,
    toolRegistry: ToolSchemaProvider
  ): Promise<UnifiedResponse> {
    const logger = getLogger()

    try {
      const tools = this.buildTools(toolRegistry)
      const body: OllamaChatBody = {
        model: this.config.model,
        messages: [
          { role: 'system', content: this.buildSystemPrompt() },
          ...this.convertMessages(request.messages),
        ],
        stream: false,
        options: { num_ctx: 32768 },
      }
      if (tools.length > 0) body.tools = tools

      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Ollama request failed', {
          status: response.status,
          body: errorText,
        })
        throw new Error(`Ollama: ${response.statusText} - ${errorText}`)
      }

      const data = (await response.json()) as {
        message?: { content?: string; tool_calls?: OllamaToolCall[] }
      }
      const msg = data.message

      if (msg?.tool_calls && msg.tool_calls.length > 0) {
        return {
          type: 'tool_use',
          tools: msg.tool_calls.map((tc, i: number) => ({
            type: 'tool_use' as const,
            id: `tool_${i}`,
            name: tc.function.name,
            input: (typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments) as Record<string, unknown>,
          })),
        }
      }

      return { type: 'text', content: msg?.content || '' }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('Ollama failed', { error: message })
      return { type: 'error', error: message }
    }
  }

  async *chatStream(
    request: UnifiedRequest,
    toolRegistry: ToolSchemaProvider
  ): AsyncGenerator<StreamChunk> {
    const logger = getLogger()

    try {
      const tools = this.buildTools(toolRegistry)
      const body: OllamaChatBody = {
        model: this.config.model,
        messages: [
          { role: 'system', content: this.buildSystemPrompt() },
          ...this.convertMessages(request.messages),
        ],
        stream: true,
        options: { num_ctx: 32768 },
      }
      if (tools.length > 0) body.tools = tools

      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('Ollama stream request failed', {
          status: response.status,
          body: errorText,
        })
        throw new Error(`Ollama: ${response.statusText} - ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          const data = JSON.parse(line)
          const msg = data.message

          if (msg?.tool_calls?.length > 0) {
            for (let i = 0; i < msg.tool_calls.length; i++) {
              const tc = msg.tool_calls[i] as OllamaToolCall
              yield {
                type: 'tool_use',
                tool: {
                  type: 'tool_use',
                  id: `tool_${i}`,
                  name: tc.function.name,
                  input: (typeof tc.function.arguments === 'string'
                    ? JSON.parse(tc.function.arguments)
                    : tc.function.arguments) as Record<string, unknown>,
                },
              }
            }
          } else if (msg?.content) {
            yield { type: 'text', content: msg.content }
          }

          if (data.done) {
            yield { type: 'done' }
            return
          }
        }
      }
    } catch (error) {
      logger.error('Ollama stream failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  private buildTools(toolRegistry: ToolSchemaProvider | undefined): unknown[] {
    if (!toolRegistry) return []
    return toolRegistry.toSchema().map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))
  }

  private buildSystemPrompt(): string {
    return `You are a coding assistant. Use tools to complete tasks efficiently.
Current directory: ${process.cwd()}
Available tools: bash, read, write, edit, glob, grep, ls, cp, mv, rm`
  }

  private convertMessages(messages: Message[]) {
    return messages
      .map(m => {
        // tool_result content blocks → Ollama role: 'tool' messages
        if (m.role === 'user' && Array.isArray(m.content)) {
          const toolResults = (m.content as ContentBlock[]).filter(
            (c): c is ToolResultBlock => c.type === 'tool_result'
          )
          if (toolResults.length > 0) {
            return toolResults.map(r => ({
              role: 'tool',
              content:
                typeof r.content === 'string'
                  ? r.content
                  : JSON.stringify(r.content),
            }))
          }
        }
        // assistant messages with content blocks (rawContent format)
        if (m.role === 'assistant' && Array.isArray(m.content)) {
          const textBlock = (m.content as ContentBlock[]).find(
            (c): c is TextBlock => c.type === 'text'
          )
          return {
            role: 'assistant',
            content: textBlock?.text ?? '',
          }
        }
        return {
          role:
            m.role === 'system'
              ? 'system'
              : m.role === 'assistant'
                ? 'assistant'
                : 'user',
          content:
            typeof m.content === 'string'
              ? m.content
              : JSON.stringify(m.content),
        }
      })
      .flat()
  }
}
