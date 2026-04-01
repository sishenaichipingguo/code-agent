import type { ModelAdapter } from '@/core/models/adapter'
import { MODEL_CONTEXT_LIMITS } from '@/core/models/types'

interface Message {
  role: 'user' | 'assistant'
  content: any
}

// Trigger compression when input tokens exceed this fraction of the model's context limit
const COMPRESS_THRESHOLD = 0.8
// Number of recent conversation rounds (assistant+user pairs) to preserve after compression
const KEEP_RECENT_ROUNDS = 3

export class ContextManager {
  constructor(
    private model: ModelAdapter,
    private modelName: string
  ) {}

  shouldCompress(inputTokens: number): boolean {
    const limit = MODEL_CONTEXT_LIMITS[this.modelName] ?? 200_000
    return inputTokens > limit * COMPRESS_THRESHOLD
  }

  async compress(messages: Message[]): Promise<Message[]> {
    const keepCount = KEEP_RECENT_ROUNDS * 2  // each round = 1 assistant + 1 user message
    if (messages.length <= keepCount + 1) {
      // Not enough history to compress meaningfully
      return messages
    }

    const toSummarize = messages.slice(0, messages.length - keepCount)
    const toKeep = messages.slice(messages.length - keepCount)

    // Call the model to summarize — no tools needed, plain text only
    const summaryResponse = await this.model.chat(
      {
        model: this.modelName,
        messages: [
          ...toSummarize,
          {
            role: 'user',
            content: 'Summarize the above conversation concisely. Preserve: key decisions made, files created or modified, errors encountered and how they were resolved, and any context needed to continue the current task.'
          }
        ] as any,
        max_tokens: 1024,
        stream: false
      },
      { toSchema: () => [] }  // no tools for summary call
    )

    const summary = summaryResponse.content ?? 'Previous conversation summarized (content unavailable).'

    const summaryMessage: Message = {
      role: 'user',
      content: `[Context summary — earlier conversation compressed]\n${summary}`
    }

    return [summaryMessage, ...toKeep]
  }
}
