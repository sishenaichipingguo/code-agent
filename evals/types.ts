// Types for the task-based evaluation harness.
//
// An eval measures the agent as a black box: given a prepared workspace and a
// prompt, did it accomplish the task? Internal reasoning is irrelevant — only
// the machine-checkable outcome and a few cost/effort signals matter.

export interface CheckResult {
  passed: boolean
  // Human-readable reason, shown in the scorecard (e.g. "file missing").
  detail: string
}

export interface CheckContext {
  workDir: string
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface EvalTask {
  // Stable identifier, also used as the results key. kebab-case.
  id: string
  // One-line description of what capability this task probes.
  description: string
  // The instruction handed to the agent.
  prompt: string
  // Per-task wall-clock budget in ms (defaults applied by the runner).
  timeoutMs?: number
  // Populate the temp workspace before the agent runs (write fixture files).
  setup?: (workDir: string) => Promise<void>
  // Decide pass/fail by inspecting the workspace and the agent's output.
  check: (ctx: CheckContext) => Promise<CheckResult>
}

// Signals scraped from a single agent run.
export interface RunMetrics {
  durationMs: number
  exitCode: number | null
  cost: number | null
  totalTokens: number | null
  // Number of LLM round-trips (api-call count). Higher = more wandering.
  llmTurns: number | null
  // Number of tool executions.
  toolCalls: number | null
}

export interface TaskResult {
  id: string
  description: string
  passed: boolean
  detail: string
  metrics: RunMetrics
}

export interface Scorecard {
  startedAt: string
  model: string | null
  passRate: number
  passed: number
  total: number
  totalCost: number
  totalDurationMs: number
  results: TaskResult[]
}
