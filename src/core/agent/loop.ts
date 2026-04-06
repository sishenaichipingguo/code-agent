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
}

interface Message {
  role: 'user' | 'assistant'
  content: any
}

export class AgentLoop {
  private _messages: Message[] = []

  constructor(private context: AgentContext) {}

  async run(userMessage: string): Promise<string> {
    const metrics = getMetrics()
    const hookEnv = { AGENT_CWD: process.cwd() }

    await this.context.hooks?.fire('session-start', hookEnv)

    // Seed with history if resuming a session
    this._messages = [...(this.context.initialMessages ?? [])]
    const messages = this._messages

    // Save and append the new user message
    const userMsg: Message = { role: 'user', content: userMessage }
    messages.push(userMsg)
    await this.saveMessage('user', userMessage)

    this.context.logger.info('Agent loop started', { message: userMessage })
    let finalText = ''

    try {
      while (true) {
        const request = {
          model: this.context.model.name,
          messages,
          stream: !!this.context.streaming,
          system: this.context.systemPrompt
        }

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

  private async executeTools(tools: any[]): Promise<any[]> {
    const metrics = getMetrics()

    // Check if all tools in this batch are concurrency-safe (safe to parallelize)
    const allConcurrencySafe = tools.every(t => {
      const tool = this.context.tools.get(t.name)
      return tool?.isConcurrencySafe(t.input) ?? false
    })

    const runTool = async (tool: any) => {
      try {
        const result = await metrics.measure('tool-execution', () =>
          this.context.tools.execute(tool.name, tool.input, this.context.permissionContext)
        )
        process.stderr.write(`✓ ${tool.name}\n`)
        return { id: tool.id, result }
      } catch (error: any) {
        const { AgentError } = await import('@/infra/errors')
        if (error instanceof AgentError) {
          process.stderr.write(`\n❌ ${error.toUserMessage()}\n`)
          const suggestion = error.getSuggestion()
          if (suggestion) process.stderr.write(`💡 ${suggestion}\n`)
        } else {
          process.stderr.write(`✗ ${tool.name}: ${error.message}\n`)
        }
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

  private async runWithStream(
    request: any,
    messages: Message[]
  ): Promise<{ done: boolean; text: string; inputTokens?: number }> {
    if (!this.context.model.chatStream) return { done: false, text: '' }

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
          const results = await this.executeTools(tools)

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
          if (sampled?.text) fullText = sampled.text
          messages.push({ role: 'assistant', content: [{ type: 'text', text: fullText }] })
          await this.saveMessage('assistant', [{ type: 'text', text: fullText }])
        }
        return { done: true, text: fullText, inputTokens }
      }
    }

    return { done: true, text: fullText, inputTokens }
  }
}
