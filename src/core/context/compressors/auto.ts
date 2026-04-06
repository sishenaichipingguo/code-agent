import type { Compressor, CompressorResult, RawMessage } from './types'
import type { ModelAdapter } from '@/core/models/adapter'

const KEEP_RECENT_ROUNDS = 3

export class AutoCompressor implements Compressor {
  async run(messages: RawMessage[], model: ModelAdapter, modelName: string): Promise<CompressorResult> {
    const keepCount = KEEP_RECENT_ROUNDS * 2
    if (messages.length <= keepCount + 1) {
      return { messages, summary: '' }
    }

    const toSummarize = messages.slice(0, messages.length - keepCount)
    const toKeep = messages.slice(messages.length - keepCount)

    const response = await model.chat(
      {
        model: modelName,
        messages: [
          ...toSummarize,
          {
            role: 'user',
            content: 'Summarize the above conversation concisely. Preserve: key decisions made, files created or modified, errors encountered and resolved, and context needed to continue the current task.'
          }
        ] as any,
        max_tokens: 1024,
        stream: false
      },
      { toSchema: () => [] }
    )

    const summary = response.content ?? 'Previous conversation summarized (content unavailable).'
    return { messages: toKeep, summary }
  }
}
