import type { ModelAdapter } from '@/core/models/adapter'
import type { ToolRegistry } from '@/core/tools/registry'
import type { Logger } from '@/infra/logger'
import { getMetrics } from '@/infra/metrics'

export interface AgentContext {
  model: ModelAdapter
  tools: ToolRegistry
  mode: 'yolo' | 'safe'
  logger: Logger
  streaming?: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: any
}

export class AgentLoop {
  constructor(private context: AgentContext) {}

  async run(userMessage: string): Promise<void> {
    const metrics = getMetrics()
    const messages: Message[] = [
      { role: 'user', content: userMessage }
    ]

    this.context.logger.info('Agent loop started', { message: userMessage })

    try {
      while (true) {
        // Use streaming if available and enabled
        if (this.context.streaming && this.context.model.chatStream) {
          const handled = await this.runWithStream(messages)
          if (handled) break
        } else {
          // Call model
          const response = await metrics.measure('api-call', () =>
            this.context.model.chat(messages, this.context.tools)
          )

          // Handle text response
          if (response.type === 'text') {
            console.log('\n' + response.content)
            break
          }

          // Handle tool calls
          if (response.type === 'tool_use') {
            const results = await this.executeTools(response.tools)

            messages.push({
              role: 'assistant',
              content: response.tools
            })
            messages.push({
              role: 'user',
              content: results
            })
            continue
          }

          // Handle errors
          if (response.type === 'error') {
            console.error('Error:', response.error)
            break
          }
        }
      }
    } catch (error: any) {
      this.context.logger.error('Agent loop failed', { error: error.message })
      throw error
    }
  }

  private async executeTools(tools: any[]): Promise<any[]> {
    const metrics = getMetrics()

    const results = await Promise.all(
      tools.map(async (tool) => {
        try {
          const result = await metrics.measure('tool-execution', () =>
            this.context.tools.execute(
              tool.name,
              tool.input,
              this.context.mode
            )
          )

          console.log(`✓ ${tool.name}`)
          return { id: tool.id, result }
        } catch (error: any) {
          // Enhanced error display
          const { AgentError } = await import('@/infra/errors')
          if (error instanceof AgentError) {
            console.error(`\n❌ ${error.toUserMessage()}`)
            const suggestion = error.getSuggestion()
            if (suggestion) console.error(`💡 ${suggestion}`)
          } else {
            console.error(`✗ ${tool.name}: ${error.message}`)
          }

          this.context.logger.error('Tool execution failed', {
            tool: tool.name,
            error: error.message
          })

          return { id: tool.id, error: error.message }
        }
      })
    )

    return results
  }

  private async runWithStream(messages: Message[]): Promise<boolean> {
    if (!this.context.model.chatStream) return false

    const stream = this.context.model.chatStream(messages, this.context.tools)
    let fullText = ''
    const tools: any[] = []

    console.log('\n')

    for await (const chunk of stream) {
      if (chunk.type === 'text' && chunk.content) {
        process.stdout.write(chunk.content)
        fullText += chunk.content
      }

      if (chunk.type === 'tool_use' && chunk.tool) {
        tools.push(chunk.tool)
      }

      if (chunk.type === 'done') {
        if (tools.length > 0) {
          // Handle tool calls
          const results = await this.executeTools(tools)
          messages.push({ role: 'assistant', content: tools })
          messages.push({ role: 'user', content: results })
          return false // Continue loop
        }
        return true // Done
      }
    }

    return true
  }
}
