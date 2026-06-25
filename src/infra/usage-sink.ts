// Persists per-run token/cost/performance data to disk so it survives past the
// terminal. printSummary() only writes to stderr; this appends one JSON line per
// run to usage.jsonl, next to the agent log, giving cost/effort a queryable home.
//
// Privacy: we deliberately do NOT record the user's prompt or any file content —
// only aggregate usage and timing.

import { appendFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'
import type { TokenTracker, TokenUsage } from './token-tracker'
import type { MetricSummary, PerformanceMetrics } from './metrics'

const USAGE_FILE = 'usage.jsonl'

export interface UsageRecord {
  timestamp: string
  mode: string
  model: string
  usage: TokenUsage
  performance: MetricSummary[]
}

export interface AppendUsageOptions {
  // Path to the agent log file; usage.jsonl is written alongside it.
  logFile: string
  mode: string
  model: string
  tracker: TokenTracker
  metrics: PerformanceMetrics
}

export async function appendUsageLog(opts: AppendUsageOptions): Promise<void> {
  const { logFile, mode, model, tracker, metrics } = opts

  const usage = tracker.getUsage()
  // A run with no model calls produced nothing worth recording.
  if (usage.totalTokens === 0) return

  const record: UsageRecord = {
    timestamp: new Date().toISOString(),
    mode,
    model,
    usage,
    performance: metrics.snapshot(),
  }

  const dir = dirname(logFile)
  await mkdir(dir, { recursive: true })
  await appendFile(join(dir, USAGE_FILE), JSON.stringify(record) + '\n')
}
