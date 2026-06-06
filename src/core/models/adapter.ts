import type { UnifiedResponse, StreamChunk } from './types'

// Canonical ModelAdapter lives in ./types; re-export here for back-compat
// since several modules import it from this path.
export type { ModelAdapter } from './types'

// Legacy exports for compatibility
export type { UnifiedResponse as ModelResponse, StreamChunk }
