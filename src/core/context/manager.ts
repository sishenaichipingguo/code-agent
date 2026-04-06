import type { ModelAdapter } from '@/core/models/adapter'
import { MODEL_CONTEXT_LIMITS } from '@/core/models/types'
import type { RawMessage } from './compressors/types'
import { AutoCompressor } from './compressors/auto'
import { MicroCompactor } from './compressors/micro'
import { ManualCompactor } from './compressors/manual'
import type { HookManager } from '@/core/hooks/manager'

export type CompressionStrategy = 'auto' | 'micro' | 'manual'

const COMPRESS_THRESHOLD = 0.8
const PTL_PATTERNS = ['prompt is too long', 'prompt_too_long', 'context_length_exceeded', 'maximum context length']

export class ContextManager {
  private compressors = {
    auto: new AutoCompressor(),
    micro: new MicroCompactor(),
    manual: new ManualCompactor()
  }

  constructor(
    private model: ModelAdapter,
    private modelName: string,
    private hooks?: HookManager
  ) {}

  shouldCompress(inputTokens: number): boolean {
    const limit = MODEL_CONTEXT_LIMITS[this.modelName] ?? 200_000
    return inputTokens > limit * COMPRESS_THRESHOLD
  }

  async compress(messages: RawMessage[], strategy: CompressionStrategy = 'auto'): Promise<RawMessage[]> {
    const hookEnv: Record<string, string> = { AGENT_COMPRESS_STRATEGY: strategy }

    // pre-compress: transform — hook may archive or modify messages before summarisation
    let effectiveMessages = messages
    if (this.hooks) {
      const transformed = await this.hooks.transform('pre-compress', { messages }, hookEnv)
      effectiveMessages = transformed.messages
    }

    const compressor = this.compressors[strategy]
    const result = await compressor.run(effectiveMessages, this.model, this.modelName)
    const compressed = [this.buildPostCompressMessage(result.summary, strategy), ...result.messages]

    // post-compress: notify
    await this.hooks?.fire('post-compress', {
      ...hookEnv,
      AGENT_COMPRESS_ORIGINAL_COUNT: String(messages.length),
      AGENT_COMPRESS_RESULT_COUNT: String(compressed.length)
    })

    return compressed
  }

  /** Execute fn(); if a PTL-style error is thrown, compress with 'auto' and retry once. */
  async ptlRetry<T>(messages: RawMessage[], fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (err: any) {
      const msg: string = (err?.message ?? '').toLowerCase()
      const isPtl = PTL_PATTERNS.some(p => msg.includes(p))
      if (!isPtl) throw err

      const compressed = await this.compress(messages, 'auto')
      messages.splice(0, messages.length, ...compressed)
      return fn()
    }
  }

  private buildPostCompressMessage(summary: string, strategy: CompressionStrategy): RawMessage {
    const label = strategy === 'manual' ? 'manual /compact' : `auto (${strategy})`
    return {
      role: 'user',
      content: [
        `[Context compressed — ${label}]`,
        summary ? `Summary: ${summary}` : '',
        'The full conversation history above this point has been summarized. Continue the current task using this context.'
      ].filter(Boolean).join('\n')
    }
  }
}
