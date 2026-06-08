import type { ModelAdapter } from '@/core/models/adapter'
import type {
  ContentBlock,
  UnifiedRequest,
  ToolUseBlock,
} from '@/core/models/types'
import type { ToolRegistry } from '@/core/tools/registry'
import type { Logger } from '@/infra/logger'
import type {
  ContextManager,
  CompressionStrategy,
} from '@/core/context/manager'
import type { SessionManager } from '@/core/session/manager'
import type { PermissionContext } from '@/core/permissions'
import type { HookManager } from '@/core/hooks/manager'
import { getMetrics } from '@/infra/metrics'

// Message content is either plain text or an array of structured content
// blocks (text / tool_use / tool_result), matching the model adapters.
type MessageContent = string | ContentBlock[]

// A streamed update emitted during an agent run.
export type AgentChunk =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; name: string; input: string }
  | {
      type: 'tool_end'
      name: string
      duration: number
      result: string
      error?: string
    }

export interface AgentContext {
  model: ModelAdapter
  tools: ToolRegistry
  permissionContext: PermissionContext
  logger: Logger
  streaming?: boolean
  contextManager?: ContextManager
  systemPrompt?: string
  initialMessages?: Array<{
    role: 'user' | 'assistant'
    content: MessageContent
  }>
  sessionManager?: SessionManager
  hooks?: HookManager
  memoryRecallFn?: (query: string, project?: string) => Promise<string>
  onChunk?: (chunk: AgentChunk) => void
}

interface Message {
  role: 'user' | 'assistant'
  content: MessageContent
}

// A tool invocation requested by the model.
interface ToolUseRequest {
  id: string
  name: string
  input: Record<string, unknown>
}

// The outcome of executing a single tool.
interface ToolExecutionResult {
  id: string
  result?: unknown
  error?: string
}

export class AgentLoop {
  private _messages: Message[] = []

  constructor(public context: AgentContext) {}

  async run(userMessage: string): Promise<string> {
    const metrics = getMetrics()
    const hookEnv = { AGENT_CWD: process.cwd() }

    // Seed with history only on first call
    if (this._messages.length === 0 && this.context.initialMessages?.length) {
      this._messages = [...this.context.initialMessages]
    }
    const messages = this._messages

    // Save and append the new user message
    const userMsg: Message = { role: 'user', content: userMessage }
    messages.push(userMsg)
    await this.saveMessage('user', userMessage)

    this.context.logger.info('Agent loop started', { message: userMessage })
    let finalText = ''

    try {
      await this.context.hooks?.fire('session-start', hookEnv)

      // Trigger user-prompt-submit hook for memory system initialization
      await this.context.hooks?.fire('user-prompt-submit', {
        ...hookEnv,
        USER_PROMPT: userMessage,
        SESSION_ID:
          this.context.sessionManager?.getCurrentSession()?.id || 'unknown',
      })

      // Recall relevant memories from past sessions
      let recalledMemories = ''
      if (this.context.memoryRecallFn) {
        try {
          recalledMemories = await this.context.memoryRecallFn(userMessage)
          if (recalledMemories) {
            this.context.logger.debug('Recalled memories', {
              length: recalledMemories.length,
            })
          }
        } catch (error) {
          this.context.logger.warn('Memory recall failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      // Build dynamic system prompt with recalled memories
      const dynamicSystemPrompt = recalledMemories
        ? `${this.context.systemPrompt}\n\n${recalledMemories}`
        : this.context.systemPrompt

      let turn = 0
      while (true) {
        turn++
        const request: UnifiedRequest = {
          model: this.context.model.name,
          messages: messages as UnifiedRequest['messages'],
          stream: !!this.context.streaming,
          system: dynamicSystemPrompt,
        }

        this.context.logger.debug(
          `Turn ${turn}: sending ${messages.length} messages`,
          {
            lastMessage: JSON.stringify(messages[messages.length - 1]).slice(
              0,
              300
            ),
            allMessages: JSON.stringify(messages).slice(0, 3000),
          }
        )

        if (this.context.streaming && this.context.model.chatStream) {
          const result = await this.runWithStream(request, messages)
          if (result.done) {
            finalText = result.text
            break
          }
          await this.maybeCompress(messages, result.inputTokens)
        } else {
          const response = this.context.contextManager
            ? await this.context.contextManager.ptlRetry(messages, () =>
                metrics.measure('api-call', () =>
                  this.context.model.chat(request, this.context.tools)
                )
              )
            : await metrics.measure('api-call', () =>
                this.context.model.chat(request, this.context.tools)
              )

          await this.maybeCompress(messages, response.inputTokens)

          if (response.type === 'text') {
            let text = response.content ?? ''
            const sampled = await this.context.hooks?.transform(
              'post-sampling',
              { text },
              hookEnv
            )
            if (sampled) text = sampled.text
            process.stderr.write('\n' + text + '\n')
            finalText = text
            const assistantContent = response.rawContent ?? [
              { type: 'text', text: finalText },
            ]
            messages.push({ role: 'assistant', content: assistantContent })
            await this.saveMessage('assistant', assistantContent)
            break
          }

          if (response.type === 'tool_use') {
            const results = await this.executeTools(response.tools ?? [])

            const assistantContent: ContentBlock[] =
              response.rawContent ?? response.tools ?? []
            messages.push({ role: 'assistant', content: assistantContent })
            await this.saveMessage('assistant', assistantContent)

            const toolResults = results.map(r => ({
              type: 'tool_result',
              tool_use_id: r.id,
              content:
                typeof r.result === 'string'
                  ? r.result
                  : JSON.stringify(r.result),
            }))
            messages.push({ role: 'user', content: toolResults })
            await this.saveMessage('user', toolResults)
            continue
          }

          if (response.type === 'error') {
            process.stderr.write('Error: ' + response.error + '\n')
            break
          }
        }
      }
    } catch (error) {
      this.context.logger.error('Agent loop failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      await this.context.hooks?.fire('session-end', hookEnv)
    }

    return finalText
  }

  private async saveMessage(
    role: 'user' | 'assistant',
    content: MessageContent
  ) {
    if (this.context.sessionManager) {
      await this.context.sessionManager.saveMessage(role, content)
    }
  }

  private async maybeCompress(
    messages: Message[],
    inputTokens?: number,
    strategy: CompressionStrategy = 'auto'
  ) {
    if (!this.context.contextManager || !inputTokens) return
    if (this.context.contextManager.shouldCompress(inputTokens)) {
      this.context.logger.warn(
        'Context approaching limit, compressing history',
        { inputTokens, strategy }
      )
      process.stderr.write(
        `⚠️  Context at ${inputTokens.toLocaleString()} tokens — compressing (${strategy})...\n`
      )
      const compressed = await this.context.contextManager.compress(
        messages,
        strategy
      )
      messages.splice(0, messages.length, ...compressed)
      process.stderr.write(`✓ Compressed to ${compressed.length} messages\n`)
    }
  }

  async compact(messages: Message[]): Promise<void> {
    if (!this.context.contextManager) {
      process.stderr.write(
        '⚠️  No context manager configured, /compact unavailable\n'
      )
      return
    }
    process.stderr.write('🗜  Compressing context on request...\n')
    const compressed = await this.context.contextManager.compress(
      messages,
      'manual'
    )
    messages.splice(0, messages.length, ...compressed)
    process.stderr.write(
      `✓ Context compressed to ${compressed.length} messages\n`
    )
  }

  getMessages(): Message[] {
    return this._messages
  }

  clearMessages(): void {
    this._messages = []
  }

  private async executeTools(
    tools: ToolUseRequest[]
  ): Promise<ToolExecutionResult[]> {
    const metrics = getMetrics()

    // Check if all tools in this batch are concurrency-safe (safe to parallelize)
    const allConcurrencySafe = tools.every(t => {
      const tool = this.context.tools.get(t.name)
      return tool?.isConcurrencySafe(t.input) ?? false
    })

    const runTool = async (
      tool: ToolUseRequest
    ): Promise<ToolExecutionResult> => {
      const startTime = Date.now()

      this.context.onChunk?.({
        type: 'tool_start',
        name: tool.name,
        input: tool.input ? JSON.stringify(tool.input).slice(0, 120) : '',
      })

      try {
        const result = await metrics.measure('tool-execution', () =>
          this.context.tools.execute(
            tool.name,
            tool.input,
            this.context.permissionContext
          )
        )
        const duration = Date.now() - startTime
        const resultStr =
          typeof result === 'string' ? result : JSON.stringify(result)

        this.context.onChunk?.({
          type: 'tool_end',
          name: tool.name,
          duration,
          result: resultStr,
        })

        // Trigger post-tool-use hook for recording observation
        await this.context.hooks?.fire('post-tool-use', {
          AGENT_CWD: process.cwd(),
          TOOL_NAME: tool.name,
          TOOL_INPUT: JSON.stringify(tool.input),
          TOOL_RESULT: resultStr.slice(0, 10000), // Limit size to avoid env var overflow
          SESSION_ID:
            this.context.sessionManager?.getCurrentSession()?.id || 'unknown',
        })

        return { id: tool.id, result }
      } catch (error) {
        const duration = Date.now() - startTime
        const { AgentError } = await import('@/infra/errors')
        const errorMsg =
          error instanceof AgentError
            ? error.toUserMessage()
            : error instanceof Error
              ? error.message
              : String(error)

        this.context.onChunk?.({
          type: 'tool_end',
          name: tool.name,
          duration,
          result: '',
          error: errorMsg,
        })

        this.context.logger.error('Tool execution failed', {
          tool: tool.name,
          error: errorMsg,
        })
        return { id: tool.id, error: errorMsg }
      }
    }

    if (allConcurrencySafe) {
      return Promise.all(tools.map(runTool))
    }

    const results: ToolExecutionResult[] = []
    for (const tool of tools) {
      results.push(await runTool(tool))
    }
    return results
  }

  private formatValue(value: unknown): string {
    if (typeof value === 'string') {
      // Truncate long strings
      if (value.length > 100) {
        return `"${value.slice(0, 100)}..." (${value.length} chars)`
      }
      return `"${value}"`
    }
    if (typeof value === 'object' && value !== null) {
      const str = JSON.stringify(value)
      if (str.length > 100) {
        return `${str.slice(0, 100)}... (${str.length} chars)`
      }
      return str
    }
    return String(value)
  }

  private async runWithStream(
    request: UnifiedRequest,
    messages: Message[],
    attempt = 0
  ): Promise<{ done: boolean; text: string; inputTokens?: number }> {
    if (!this.context.model.chatStream) return { done: false, text: '' }

    try {
      const stream = this.context.model.chatStream(request, this.context.tools)
      let fullText = ''
      const completedTools = new Map<number, ToolUseBlock>()
      let hasTools = false
      let inputTokens: number | undefined

      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.content) {
          process.stderr.write(chunk.content)
          fullText += chunk.content
          this.context.onChunk?.({ type: 'text', content: chunk.content })
        }

        if (
          chunk.type === 'tool_use' &&
          chunk.tool &&
          chunk.toolIndex !== undefined
        ) {
          if (chunk.tool.input && Object.keys(chunk.tool.input).length > 0) {
            completedTools.set(chunk.toolIndex, chunk.tool)
            hasTools = true
          }
        }

        if (chunk.type === 'done') {
          inputTokens = chunk.inputTokens

          if (hasTools && completedTools.size > 0) {
            const tools = Array.from(completedTools.values())
            this.context.logger.debug('Executing tools', {
              tools: tools.map(t => ({ name: t.name, input: t.input })),
            })
            const results = await this.executeTools(tools)
            this.context.logger.debug('Tool results', {
              results: results.map(r => ({
                id: r.id,
                result: String(r.result ?? r.error).slice(0, 200),
              })),
            })

            const assistantContent: ContentBlock[] = []
            if (fullText)
              assistantContent.push({ type: 'text', text: fullText })
            tools.forEach(t =>
              assistantContent.push({
                type: 'tool_use',
                id: t.id,
                name: t.name,
                input: t.input,
              })
            )

            messages.push({ role: 'assistant', content: assistantContent })
            await this.saveMessage('assistant', assistantContent)

            const toolResults = results.map(r => ({
              type: 'tool_result',
              tool_use_id: r.id,
              content:
                typeof r.result === 'string'
                  ? r.result
                  : JSON.stringify(r.result),
            }))
            messages.push({ role: 'user', content: toolResults })
            await this.saveMessage('user', toolResults)

            return { done: false, text: '', inputTokens }
          }

          // Pure text response — save assistant message
          if (fullText) {
            const hookEnv = { AGENT_CWD: process.cwd() }
            const sampled = await this.context.hooks?.transform(
              'post-sampling',
              { text: fullText },
              hookEnv
            )
            const displayText = sampled?.text ?? fullText
            messages.push({
              role: 'assistant',
              content: [{ type: 'text', text: fullText }],
            })
            await this.saveMessage('assistant', [
              { type: 'text', text: fullText },
            ])
            return { done: true, text: displayText, inputTokens }
          }
          return { done: true, text: fullText, inputTokens }
        }
      }

      return { done: true, text: fullText, inputTokens }
    } catch (error) {
      const { AgentError } = await import('@/infra/errors')
      const maxRetries = 10
      const baseDelay = 1000
      const maxDelay = 60000

      if (
        error instanceof AgentError &&
        error.recoverable &&
        attempt < maxRetries
      ) {
        // Index retreats, everything shakes（Full Jitter）
        const exponentialDelay = Math.min(
          maxDelay,
          baseDelay * Math.pow(2, attempt)
        )
        const delay = Math.random() * exponentialDelay

        const errorDetail = error as Error & {
          status?: number
          code?: string
        }
        this.context.logger.warn(
          `Stream failed, retrying (${attempt + 1}/${maxRetries})`,
          {
            error: error.message,
            errorType: errorDetail.status || errorDetail.code,
            nextRetryIn: `${(delay / 1000).toFixed(1)}s`,
          }
        )

        await new Promise(resolve => setTimeout(resolve, delay))
        return this.runWithStream(request, messages, attempt + 1)
      }
      throw error
    }
  }
}
