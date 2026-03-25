import type { Args } from './parser'
import { initLogger, getLogger } from '@/infra/logger'
import { initTokenTracker, getTokenTracker } from '@/infra/token-tracker'
import { initMetrics, getMetrics } from '@/infra/metrics'
import { GracefulShutdown } from '@/infra/graceful-shutdown'
import { loadConfig } from '@/core/config/loader'
import { AgentLoop } from '@/core/agent/loop'
import { createToolRegistry } from '@/core/tools/registry'
import { AnthropicAdapter } from '@/core/models/anthropic'
import { SessionManager } from '@/core/session/manager'

export async function runSafe(args: Args) {
  // Load config
  const config = await loadConfig()

  // Initialize infrastructure
  const logger = initLogger(config.logging!)
  const tracker = initTokenTracker()
  const metrics = initMetrics()
  const shutdown = new GracefulShutdown()
  const sessionManager = new SessionManager()

  logger.info('Starting in Safe mode')

  // Setup graceful shutdown
  shutdown.onShutdown(async () => {
    console.log('💾 Saving session...')
    await sessionManager.save()
  })

  shutdown.onShutdown(async () => {
    console.log('📝 Closing logs...')
    await logger.close()
  })

  shutdown.onShutdown(async () => {
    tracker.printSummary()
    metrics.printSummary()
  })

  // Initialize components
  const tools = createToolRegistry()
  const model = new AnthropicAdapter({
    apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
    model: args.model || config.model
  })

  // Create session
  await sessionManager.createSession('safe', config.model)

  const loop = new AgentLoop({
    model,
    tools,
    mode: 'safe',
    logger,
    streaming: true
  })

  const message = args.message || await promptUser()
  await loop.run(message)

  // Save session
  await sessionManager.save()

  // Print summaries
  tracker.printSummary()
  metrics.printSummary()
}

async function promptUser(): Promise<string> {
  console.log('Enter your request:')
  const decoder = new TextDecoder()
  const buffer = new Uint8Array(1024)
  const n = await Bun.stdin.read(buffer)
  return decoder.decode(buffer.slice(0, n)).trim()
}
