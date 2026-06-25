// Eval runner: for each task, prepare a throwaway workspace, run the agent
// against it, check the outcome, and aggregate a scorecard. Results are both
// printed and persisted to evals/results/<timestamp>.json so you can compare
// runs over time (regression detection after prompt/model/code changes).
//
//   bun run evals/runner.ts            # run the whole suite
//   bun run evals/runner.ts fix-bug    # run one task by id

import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { runAgentForEval } from './run-agent'
import { TASKS } from './tasks'
import type { EvalTask, RunMetrics, Scorecard, TaskResult } from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESULTS_DIR = join(__dirname, 'results')

function requireApiKey(): void {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key || key === 'test-key') {
    console.error(
      'ERROR: a real ANTHROPIC_API_KEY is required to run evals.\n' +
        '  export ANTHROPIC_API_KEY=sk-ant-...'
    )
    process.exit(1)
  }
}

function fmtCost(c: number | null): string {
  return c === null ? ' n/a' : `$${c.toFixed(4)}`
}

function fmtMetric(m: RunMetrics): string {
  const secs = (m.durationMs / 1000).toFixed(0)
  const turns = m.llmTurns ?? '?'
  const tools = m.toolCalls ?? '?'
  return `${secs}s · ${turns} turns · ${tools} tools · ${fmtCost(m.cost)}`
}

async function runTask(task: EvalTask): Promise<TaskResult> {
  const workDir = await mkdtemp(join(tmpdir(), `eval-${task.id}-`))
  try {
    if (task.setup) await task.setup(workDir)

    const run = await runAgentForEval(task.prompt, workDir, task.timeoutMs)

    if (run.timedOut) {
      return {
        id: task.id,
        description: task.description,
        passed: false,
        detail: 'timed out',
        metrics: run.metrics,
      }
    }

    const check = await task.check({
      workDir,
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.exitCode,
    })

    return {
      id: task.id,
      description: task.description,
      passed: check.passed,
      detail: check.detail,
      metrics: run.metrics,
    }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}

function buildScorecard(results: TaskResult[]): Scorecard {
  const passed = results.filter(r => r.passed).length
  const totalCost = results.reduce((s, r) => s + (r.metrics.cost ?? 0), 0)
  const totalDurationMs = results.reduce((s, r) => s + r.metrics.durationMs, 0)
  return {
    startedAt: new Date().toISOString(),
    model: process.env.AGENT_MODEL ?? null,
    passRate: results.length ? passed / results.length : 0,
    passed,
    total: results.length,
    totalCost,
    totalDurationMs,
    results,
  }
}

function printScorecard(card: Scorecard): void {
  console.log('\n=== Eval Scorecard ===')
  for (const r of card.results) {
    const mark = r.passed ? 'PASS' : 'FAIL'
    console.log(`  [${mark}] ${r.id.padEnd(18)} ${fmtMetric(r.metrics)}`)
    if (!r.passed) console.log(`         ↳ ${r.detail}`)
  }
  const pct = (card.passRate * 100).toFixed(0)
  console.log(
    `\n  ${card.passed}/${card.total} passed (${pct}%) · ` +
      `total ${fmtCost(card.totalCost)} · ` +
      `${(card.totalDurationMs / 1000).toFixed(0)}s wall`
  )
}

async function persist(card: Scorecard): Promise<string> {
  await mkdir(RESULTS_DIR, { recursive: true })
  const stamp = card.startedAt.replace(/[:.]/g, '-')
  const file = join(RESULTS_DIR, `${stamp}.json`)
  await writeFile(file, JSON.stringify(card, null, 2))
  return file
}

async function main(): Promise<void> {
  requireApiKey()

  const filter = process.argv[2]
  const suite = filter ? TASKS.filter(t => t.id === filter) : TASKS
  if (suite.length === 0) {
    console.error(`No task matches "${filter}". Known ids:`)
    for (const t of TASKS) console.error(`  - ${t.id}`)
    process.exit(1)
  }

  console.log(`Running ${suite.length} eval task(s)...`)
  const results: TaskResult[] = []
  for (const task of suite) {
    process.stdout.write(`  • ${task.id} ... `)
    const result = await runTask(task)
    console.log(result.passed ? 'PASS' : `FAIL (${result.detail})`)
    results.push(result)
  }

  const card = buildScorecard(results)
  printScorecard(card)
  const file = await persist(card)
  console.log(`\n  Saved scorecard → ${file}`)

  // Non-zero exit when any task fails, so CI can gate on it.
  process.exit(card.passed === card.total ? 0 : 1)
}

main().catch(err => {
  console.error('Eval runner crashed:', err)
  process.exit(1)
})
