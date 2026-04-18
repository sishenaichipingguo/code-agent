import Anthropic from '@anthropic-ai/sdk'
import type { InitPromptContext, ContinuationPromptContext, SummaryPromptContext } from '../types'

export class SDKAgent {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey })
    // Use configurable model, fallback to a more compatible default
    this.model = model || process.env.WORKER_MODEL || 'claude-3-5-sonnet-20241022'
  }

  async processInit(context: InitPromptContext): Promise<string> {
    const prompt = this.buildInitPrompt(context)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })

    const content = response.content[0]
    return content.type === 'text' ? content.text : ''
  }

  async processContinuation(context: ContinuationPromptContext): Promise<string> {
    const prompt = this.buildContinuationPrompt(context)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    })

    const content = response.content[0]
    return content.type === 'text' ? content.text : ''
  }

  async processSummary(context: SummaryPromptContext): Promise<string> {
    const prompt = this.buildSummaryPrompt(context)

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    })

    const content = response.content[0]
    return content.type === 'text' ? content.text : ''
  }

  private buildInitPrompt(context: InitPromptContext): string {
    return `你是一个记忆观察者 Agent。你的任务是分析用户正在做什么，并生成结构化的观察记录。

**重要规则**：
- 你只能观察和分析，不能执行任何工具
- 你的输出必须包含在 <observation> 标签中
- 观察内容要简洁、结构化、有价值

**当前上下文**：
- 项目：${context.project}
- 工作目录：${context.cwd}
- 用户 Prompt：${context.userPrompt}

请分析用户的意图，生成一个初始观察记录。格式如下：

<observation type="init">
用户正在尝试 [简要描述用户意图]
关键信息：
- [关键点1]
- [关键点2]
</observation>`
  }

  private buildContinuationPrompt(context: ContinuationPromptContext): string {
    const inputStr = JSON.stringify(context.toolInput, null, 2).slice(0, 500)
    const responseStr = typeof context.toolResponse === 'string'
      ? context.toolResponse.slice(0, 1000)
      : JSON.stringify(context.toolResponse, null, 2).slice(0, 1000)

    return `继续观察用户的操作。

**工具调用**：
- 工具名称：${context.toolName}
- 输入参数：
\`\`\`json
${inputStr}
\`\`\`

- 执行结果：
\`\`\`
${responseStr}
\`\`\`

请分析这个工具调用的意义，生成观察记录。格式如下：

<observation type="tool_call">
用户执行了 ${context.toolName}，[简要分析目的和结果]
</observation>`
  }

  private buildSummaryPrompt(context: SummaryPromptContext): string {
    return `会话即将结束，请生成一个结构化的摘要。

**最后的 Assistant 消息**：
${context.lastAssistantMessage.slice(0, 2000)}

请生成摘要，格式如下：

<summary>
**完成的任务**：
[简要描述完成了什么]

**关键操作**：
- [操作1]
- [操作2]

**重要发现**：
[如果有重要发现或问题，在这里记录]
</summary>`
  }

  parseObservation(response: string): { type: string; content: string } | null {
    const match = response.match(/<observation type="([^"]+)">([\s\S]*?)<\/observation>/)
    if (match) {
      return { type: match[1], content: match[2].trim() }
    }
    return null
  }

  parseSummary(response: string): string | null {
    const match = response.match(/<summary>([\s\S]*?)<\/summary>/)
    return match ? match[1].trim() : null
  }
}
