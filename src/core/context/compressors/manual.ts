import type { Compressor, CompressorResult, RawMessage } from './types'
import type { ModelAdapter } from '@/core/models/adapter'

export class ManualCompactor implements Compressor {
  async run(messages: RawMessage[], model: ModelAdapter, modelName: string): Promise<CompressorResult> {
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
            content: [
              'Create a structured context summary with these sections:',
              '- Files created or modified (list with brief description of change)',
              '- Decisions made (design choices, approach selected)',
              '- Errors encountered and how they were resolved',
              '- Current task / what was being worked on when this was triggered',
              '- Any open questions or blockers',
              'Be thorough — this summary will replace the entire conversation history.'
            ].join('\n')
          }
        ] as any,
        max_tokens: 2048,
        stream: false
      },
      { toSchema: () => [] }
    )

    const summary = response.content ?? 'Context compressed on user request.'
    return { messages: [], summary }
  }
}
