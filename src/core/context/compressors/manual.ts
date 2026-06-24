import type { Compressor, CompressorResult, RawMessage } from './types'
import type { ModelAdapter } from '@/core/models/adapter'
import { manualHandoffInstruction } from './prompts'

export class ManualCompactor implements Compressor {
  async run(
    messages: RawMessage[],
    model: ModelAdapter,
    modelName: string
  ): Promise<CompressorResult> {
    if (messages.length === 0) {
      return { messages: [], summary: '' }
    }

    const response = await model.chat(
      {
        model: modelName,
        messages: [
          ...messages,
          {
            role: 'user',
            content: manualHandoffInstruction(),
          },
        ] as any,
        max_tokens: 2048,
        stream: false,
      },
      { toSchema: () => [] }
    )

    const summary = response.content ?? 'Context compressed on user request.'
    return { messages: [], summary }
  }
}
