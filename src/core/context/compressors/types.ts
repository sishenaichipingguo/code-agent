import type { ContentBlock } from '@/core/models/types'

export interface RawMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface CompressorResult {
  /** Replacement message array (does NOT include the re-hydration marker — manager adds that) */
  messages: RawMessage[]
  /** One-paragraph summary used by buildPostCompressMessages */
  summary: string
}

export interface Compressor {
  run(
    messages: RawMessage[],
    model: import('@/core/models/adapter').ModelAdapter,
    modelName: string
  ): Promise<CompressorResult>
}
