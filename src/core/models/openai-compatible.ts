import type {
  ModelAdapter,
  UnifiedRequest,
  UnifiedResponse,
  StreamChunk,
  ModelCapabilities,
} from './types'
import { getTokenTracker } from '@/infra/token-tracker'
import { getLogger } from '@/infra/logger'

interface Config {
  apiKey: string
  model: string
  baseUrl: string
}

interface OpenAIUsage {
  prompt_tokens?: number
  completion_tokens?: number
}

// Adapter for any OpenAI Chat Completions compatible endpoint: OpenAI itself,
// plus local servers (LM Studio, llama.cpp, vLLM) and gateways (OpenRouter,
// Groq). Mirrors the unified ModelAdapter contract used by the agent loop.
export class OpenAICompatibleAdapter implements ModelAdapter {
  name = 'openai-compatible'
  capabilities: ModelCapabilities = {
    tools: true,
    streaming: true,
    vision: false,
  }

  constructor(private config: Config) {}

  async chat(
    request: UnifiedRequest,
    toolRegistry: any
  ): Promise<UnifiedResponse> {
    const logger = getLogger()

    try {
      const body = this.buildBody(request, toolRegistry, false)
      const response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('OpenAI-compatible request failed', {
          status: response.status,
          body: errorText,
        })
        return {
          type: 'error',
          error: `OpenAI-compatible: ${response.status} ${errorText}`,
        }
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null
            tool_calls?: Array<{
              id?: string
              function: { name: string; arguments: string | object }
            }>
          }
        }>
        usage?: OpenAIUsage
      }

      this.trackUsage(data.usage)
      const inputTokens = data.usage?.prompt_tokens
      const msg = data.choices?.[0]?.message

      if (msg?.tool_calls?.length) {
        const tools = msg.tool_calls.map((tc, i) => ({
          type: 'tool_use' as const,
          id: tc.id || `call_${i}`,
          name: tc.function.name,
          input: this.parseArgs(tc.function.arguments),
        }))
        const text = msg.content ?? ''
        const rawContent = [...(text ? [{ type: 'text', text }] : []), ...tools]
        return { type: 'tool_use', tools, rawContent, inputTokens }
      }

      return { type: 'text', content: msg?.content ?? '', inputTokens }
    } catch (error: any) {
      logger.error('OpenAI-compatible failed', { error: error.message })
      return { type: 'error', error: error.message }
    }
  }

  async *chatStream(
    request: UnifiedRequest,
    toolRegistry: any
  ): AsyncGenerator<StreamChunk> {
    const logger = getLogger()

    try {
      const body = this.buildBody(request, toolRegistry, true)
      const response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('OpenAI-compatible stream request failed', {
          status: response.status,
          body: errorText,
        })
        throw new Error(`OpenAI-compatible: ${response.status} ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      // Tool calls stream in fragments keyed by index; accumulate then flush.
      const toolAcc = new Map<
        number,
        { id: string; name: string; args: string }
      >()
      let usage: OpenAIUsage | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice('data:'.length).trim()
          if (payload === '[DONE]') continue

          let data: any
          try {
            data = JSON.parse(payload)
          } catch {
            continue
          }

          if (data.usage) usage = data.usage
          const delta = data.choices?.[0]?.delta
          if (!delta) continue

          if (delta.content) {
            yield { type: 'text', content: delta.content }
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0
              const acc = toolAcc.get(idx) ?? { id: '', name: '', args: '' }
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.name = tc.function.name
              if (tc.function?.arguments) acc.args += tc.function.arguments
              toolAcc.set(idx, acc)
            }
          }
        }
      }

      for (const [idx, t] of toolAcc) {
        yield {
          type: 'tool_use',
          tool: {
            id: t.id || `call_${idx}`,
            name: t.name,
            input: this.parseArgs(t.args || '{}'),
          },
          toolIndex: idx,
        }
      }

      this.trackUsage(usage)
      yield { type: 'done', inputTokens: usage?.prompt_tokens }
    } catch (error: any) {
      logger.error('OpenAI-compatible stream failed', { error: error.message })
      throw error
    }
  }

  private endpoint(): string {
    return `${this.config.baseUrl}/chat/completions`
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    // Keyless local servers are supported by simply omitting the header.
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`
    }
    return headers
  }

  private buildBody(
    request: UnifiedRequest,
    toolRegistry: any,
    stream: boolean
  ): Record<string, any> {
    const tools = this.buildTools(toolRegistry)
    const body: Record<string, any> = {
      model: this.config.model,
      messages: [
        {
          role: 'system',
          content: request.system ?? this.defaultSystemPrompt(),
        },
        ...this.convertMessages(request.messages as any[]),
      ],
      stream,
      max_tokens: request.max_tokens ?? 4096,
    }
    if (request.temperature !== undefined)
      body.temperature = request.temperature
    if (tools.length > 0) body.tools = tools
    // Ask compatible servers to include token usage in the final stream chunk.
    if (stream) body.stream_options = { include_usage: true }
    return body
  }

  private buildTools(toolRegistry: any): any[] {
    if (!toolRegistry) return []
    return toolRegistry.toSchema().map((t: any) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      },
    }))
  }

  // Convert the loop's Anthropic-style message blocks into OpenAI roles.
  private convertMessages(messages: any[]): any[] {
    const out: any[] = []

    for (const m of messages) {
      // tool_result blocks → one `tool` message each, matched by tool_call_id.
      if (m.role === 'user' && Array.isArray(m.content)) {
        const toolResults = m.content.filter(
          (c: any) => c?.type === 'tool_result'
        )
        if (toolResults.length > 0) {
          for (const r of toolResults) {
            out.push({
              role: 'tool',
              tool_call_id: r.tool_use_id,
              content:
                typeof r.content === 'string'
                  ? r.content
                  : JSON.stringify(r.content),
            })
          }
          continue
        }
      }

      // assistant blocks: text and/or tool_use → content + tool_calls.
      if (m.role === 'assistant' && Array.isArray(m.content)) {
        const text = m.content
          .filter((c: any) => c?.type === 'text')
          .map((c: any) => c.text)
          .join('')
        const toolUses = m.content.filter((c: any) => c?.type === 'tool_use')

        if (toolUses.length > 0) {
          out.push({
            role: 'assistant',
            content: text || null,
            tool_calls: toolUses.map((t: any) => ({
              id: t.id,
              type: 'function',
              function: {
                name: t.name,
                arguments: JSON.stringify(t.input ?? {}),
              },
            })),
          })
        } else {
          out.push({ role: 'assistant', content: text })
        }
        continue
      }

      // Plain string content (initial user message, system, etc.)
      out.push({
        role: m.role,
        content:
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })
    }

    return out
  }

  private parseArgs(args: string | object): Record<string, any> {
    if (typeof args !== 'string') return (args as Record<string, any>) ?? {}
    try {
      return JSON.parse(args)
    } catch {
      return {}
    }
  }

  private trackUsage(usage: OpenAIUsage | undefined): void {
    if (!usage) return
    try {
      getTokenTracker().track(
        this.config.model,
        usage.prompt_tokens ?? 0,
        usage.completion_tokens ?? 0
      )
    } catch {
      // TokenTracker is optional here (e.g. unit tests run the adapter without
      // the CLI bootstrap that initializes it); usage is still returned inline.
    }
  }

  private defaultSystemPrompt(): string {
    return `You are a coding assistant. Use tools to complete tasks efficiently.
Current directory: ${process.cwd()}
Available tools: bash, read, write, edit, glob, grep, ls, cp, mv, rm`
  }
}
