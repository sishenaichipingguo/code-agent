import type { Compressor, CompressorResult, RawMessage } from './types'
import type { ModelAdapter } from '@/core/models/adapter'

const MICRO_FRACTION = 0.2
const MIN_MESSAGES_FOR_MICRO = 6

export class MicroCompactor implements Compressor {
  async run(messages: RawMessage[], model: ModelAdapter, modelName: string): Promise<CompressorResult> {
    if (messages.length < MIN_MESSAGES_FOR_MICRO) {
      return { messages, summary: '' }
    }

    const chunkSize = Math.max(2, Math.floor(messages.length * MICRO_FRACTION))
    const toSummarize = messages.slice(0, chunkSize)
    const toKeep = messages.slice(chunkSize)

    const response = await model.chat(
      {
        model: modelName,
        messages: [
          ...toSummarize,
          {
            role: 'user',
            content: 'Briefly summarize these messages in 2-3 sentences. Focus only on concrete facts: what files were touched, what decisions were made, what errors were hit.'
          }
        ] as any,
        max_tokens: 512,
        stream: false
      },
      { toSchema: () => [] }
    )

    const summary = response.content ?? 'Earlier messages compressed.'
    return { messages: toKeep, summary }
  }
}
