import type { ModelAdapter } from '@/core/models/adapter'
import type { ToolRegistry } from '@/core/tools/registry'
import type { Logger } from '@/infra/logger'
import type { ContextManager, CompressionStrategy } from '@/core/context/manager'
import type { SessionManager } from '@/core/session/manager'
import type { PermissionContext } from '@/core/permissions'
import type { HookManager } from '@/core/hooks/manager'
import { getMetrics } from '@/infra/metrics'

export interface AgentContext {
  model: ModelAdapter
  tools: ToolRegistry
  permissionContext: PermissionContext
  logger: Logger
  streaming?: boolean
  contextManager?: ContextManager
  systemPrompt?: string
  initialMessages?: Array<{ role: 'user' | 'assistant'; content: any }>
  sessionManager?: SessionManager
  hooks?: HookManager
  onChunk?: (chunk: { type: string; content?: string }) => void
}

interface Message {
  role: 'user' | 'assistant'
  content: any
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

      let turn = 0
      while (true) {
        turn++
        const request = {
          model: this.context.model.name,
          messages,
          stream: !!this.context.streaming,
          system: this.context.systemPrompt
        }

        this.context.logger.debug(`Turn ${turn}: sending ${messages.length} messages`, {
          lastMessage: JSON.stringify(messages[messages.length - 1]).slice(0, 300),
          allMessages: JSON.stringify(messages).slice(0, 3000)
        })

        if (this.context.streaming && this.context.model.chatStream) {
          const result = await this.runWithStream(request, messages)
          if (result.done) {
            finalText = result.text
            break
          }
          await this.maybeCompress(messages, result.inputTokens)
        } else {
          const response = this.context.contextManager
            ? await this.context.contextManager.ptlRetry(messages as any, () =>
                metrics.measure('api-call', () => this.context.model.chat(request, this.context.tools))
              )
            : await metrics.measure('api-call', () => this.context.model.chat(request, this.context.tools))

          await this.maybeCompress(messages, response.inputTokens)

          if (response.type === 'text') {
            let text = response.content ?? ''
            const sampled = await this.context.hooks?.transform('post-sampling', { text }, hookEnv)
            if (sampled) text = sampled.text
            process.stderr.write('\n' + text + '\n')
            finalText = text
            const assistantContent = response.rawContent ?? [{ type: 'text', text: finalText }]
            messages.push({ role: 'assistant', content: assistantContent })
            await this.saveMessage('assistant', assistantContent)
            break
          }

          if (response.type === 'tool_use') {
            const results = await this.executeTools(response.tools ?? [])

            const assistantContent = response.rawContent ?? response.tools
            messages.push({ role: 'assistant', content: assistantContent })
            await this.saveMessage('assistant', assistantContent)

            const toolResults = results.map(r => ({
              type: 'tool_result',
              tool_use_id: r.id,
              content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
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
    } catch (error: any) {
      this.context.logger.error('Agent loop failed', { error: error.message })
      throw error
    } finally {
      await this.context.hooks?.fire('session-end', hookEnv)
    }

    return finalText
  }

  private async saveMessage(role: 'user' | 'assistant', content: any) {
    if (this.context.sessionManager) {
      await this.context.sessionManager.saveMessage(role, content)
    }
  }

  private async maybeCompress(messages: Message[], inputTokens?: number, strategy: CompressionStrategy = 'auto') {
    if (!this.context.contextManager || !inputTokens) return
    if (this.context.contextManager.shouldCompress(inputTokens)) {
      this.context.logger.warn('Context approaching limit, compressing history', { inputTokens, strategy })
      process.stderr.write(`⚠️  Context at ${inputTokens.toLocaleString()} tokens — compressing (${strategy})...\n`)
      const compressed = await this.context.contextManager.compress(messages as any, strategy)
      messages.splice(0, messages.length, ...compressed)
      process.stderr.write(`✓ Compressed to ${compressed.length} messages\n`)
    }
  }

  async compact(messages: Message[]): Promise<void> {
    if (!this.context.contextManager) {
      process.stderr.write('⚠️  No context manager configured, /compact unavailable\n')
      return
    }
    process.stderr.write('🗜  Compressing context on request...\n')
    const compressed = await this.context.contextManager.compress(messages as any, 'manual')
    messages.splice(0, messages.length, ...compressed)
    process.stderr.write(`✓ Context compressed to ${compressed.length} messages\n`)
  }

  getMessages(): Message[] {
    return this._messages
  }

  clearMessages(): void {
    this._messages = []
  }

  private async executeTools(tools: any[]): Promise<any[]> {
    const metrics = getMetrics()

    // Check if all tools in this batch are concurrency-safe (safe to parallelize)
    const allConcurrencySafe = tools.every(t => {
      const tool = this.context.tools.get(t.name)
      return tool?.isConcurrencySafe(t.input) ?? false
    })

    const runTool = async (tool: any) => {
      const toolDef = this.context.tools.get(tool.name)
      const description = toolDef?.description || tool.name

      try {
        // Header with tool name and description
        process.stderr.write(`\n┌─ ${tool.name}\n`)
        if (description !== tool.name) {
          process.stderr.write(`│  ${description}\n`)
        }

        // Format and display input parameters
        if (tool.input && Object.keys(tool.input).length > 0) {
          process.stderr.write(`│\n`)
          for (const [key, value] of Object.entries(tool.input)) {
            const displayValue = this.formatValue(value)
            process.stderr.write(`│  ${key}: ${displayValue}\n`)
          }
        }

        process.stderr.write(`│\n│  ⏳ Executing...\n`)

        const startTime = Date.now()
        const result = await metrics.measure('tool-execution', () =>
          this.context.tools.execute(tool.name, tool.input, this.context.permissionContext)
        )
        const duration = Date.now() - startTime

        // Success output
        process.stderr.write(`│  ✓ Completed in ${duration}ms\n`)

        // Format and display result (truncate if too long)
        const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        if (resultStr.length > 500) {
          const preview = resultStr.slice(0, 500)
          const lines = preview.split('\n').length
          process.stderr.write(`│\n│  Result (${resultStr.length} chars, showing first 500):\n`)
          preview.split('\n').forEach(line => {
            process.stderr.write(`│  ${line}\n`)
          })
          process.stderr.write(`│  ... (truncated)\n`)
        } else if (resultStr.length > 0) {
          process.stderr.write(`│\n│  Result:\n`)
          resultStr.split('\n').forEach(line => {
            process.stderr.write(`│  ${line}\n`)
          })
        }

        process.stderr.write(`└─\n`)

        return { id: tool.id, result }
      } catch (error: any) {
        const { AgentError } = await import('@/infra/errors')

        process.stderr.write(`│  ✗ Failed\n`)
        process.stderr.write(`│\n`)

        if (error instanceof AgentError) {
          process.stderr.write(`│  ❌ ${error.toUserMessage()}\n`)
          const suggestion = error.getSuggestion()
          if (suggestion) {
            process.stderr.write(`│  💡 ${suggestion}\n`)
          }
        } else {
          const errorMsg = error.message || String(error)
          errorMsg.split('\n').forEach(line => {
            process.stderr.write(`│  ${line}\n`)
          })
        }

        process.stderr.write(`└─\n`)

        this.context.logger.error('Tool execution failed', { tool: tool.name, error: error.message })
        return { id: tool.id, error: error.message }
      }
    }

    if (allConcurrencySafe) {
      return Promise.all(tools.map(runTool))
    }

    const results: any[] = []
    for (const tool of tools) {
      results.push(await runTool(tool))
    }
    return results
  }

  private formatValue(value: any): string {
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
    request: any,
    messages: Message[],
    attempt = 0
  ): Promise<{ done: boolean; text: string; inputTokens?: number }> {
    if (!this.context.model.chatStream) return { done: false, text: '' }

    try {
      const stream = this.context.model.chatStream(request, this.context.tools)
      let fullText = ''
      const completedTools = new Map<number, any>()
      let hasTools = false
      let inputTokens: number | undefined

      process.stderr.write('\n')

      for await (const chunk of stream) {
        if (chunk.type === 'text' && chunk.content) {
          process.stderr.write(chunk.content)
          fullText += chunk.content
          this.context.onChunk?.({ type: 'text', content: chunk.content })
        }

        if (chunk.type === 'tool_use' && chunk.tool && chunk.toolIndex !== undefined) {
          if (chunk.tool.input && Object.keys(chunk.tool.input).length > 0) {
            completedTools.set(chunk.toolIndex, chunk.tool)
            hasTools = true
          }
        }

        if (chunk.type === 'done') {
          inputTokens = chunk.inputTokens

          if (hasTools && completedTools.size > 0) {
            const tools = Array.from(completedTools.values())
            this.context.logger.debug('Executing tools', { tools: tools.map(t => ({ name: t.name, input: t.input })) })
            const results = await this.executeTools(tools)
            this.context.logger.debug('Tool results', { results: results.map(r => ({ id: r.id, result: String(r.result ?? r.error).slice(0, 200) })) })

            const assistantContent: any[] = []
            if (fullText) assistantContent.push({ type: 'text', text: fullText })
            tools.forEach(t => assistantContent.push({ type: 'tool_use', id: t.id, name: t.name, input: t.input }))

            messages.push({ role: 'assistant', content: assistantContent })
            await this.saveMessage('assistant', assistantContent)

            const toolResults = results.map(r => ({
              type: 'tool_result',
              tool_use_id: r.id,
              content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
            }))
            messages.push({ role: 'user', content: toolResults })
            await this.saveMessage('user', toolResults)

            return { done: false, text: '', inputTokens }
          }

          // Pure text response — save assistant message
          if (fullText) {
            const hookEnv = { AGENT_CWD: process.cwd() }
            const sampled = await this.context.hooks?.transform('post-sampling', { text: fullText }, hookEnv)
            const displayText = sampled?.text ?? fullText
            messages.push({ role: 'assistant', content: [{ type: 'text', text: fullText }] })
            await this.saveMessage('assistant', [{ type: 'text', text: fullText }])
            return { done: true, text: displayText, inputTokens }
          }
          return { done: true, text: fullText, inputTokens }
        }
      }

      return { done: true, text: fullText, inputTokens }
    } catch (error: any) {
      const { AgentError } = await import('@/infra/errors')
      const maxRetries = 10
      const baseDelay = 1000
      const maxDelay = 60000

      if (error instanceof AgentError && error.recoverable && attempt < maxRetries) {
        // Index retreats, everything shakes（Full Jitter）
        const exponentialDelay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt))
        const delay = Math.random() * exponentialDelay

        this.context.logger.warn(
          `Stream failed, retrying (${attempt + 1}/${maxRetries})`,
          {
            error: error.message,
            errorType: (error as any).status || (error as any).code,
            nextRetryIn: `${(delay / 1000).toFixed(1)}s`
          }
        )

        await new Promise(resolve => setTimeout(resolve, delay))
        return this.runWithStream(request, messages, attempt + 1)
      }
      throw error
    }
  }
}
