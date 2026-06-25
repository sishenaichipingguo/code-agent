import type { Args } from './parser'
import { initLogger } from '@/infra/logger'
import { initTokenTracker } from '@/infra/token-tracker'
import { initMetrics } from '@/infra/metrics'
import { appendUsageLog } from '@/infra/usage-sink'
import { GracefulShutdown } from '@/infra/graceful-shutdown'
import { loadConfig } from '@/core/config/loader'
import { AgentLoop } from '@/core/agent/loop'
import { createToolRegistry } from '@/core/tools/registry'
import { ModelFactory } from '@/core/models/factory'
import { SessionManager } from '@/core/session/manager'
import { buildPermissionContext } from '@/core/permissions'
import { createHookManager } from '@/core/hooks/manager'

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

  // Persist token/perf usage to .agent/logs/usage.jsonl. Failures here must not
  // crash shutdown, so they are logged, not thrown.
  const persistUsage = async () => {
    try {
      await appendUsageLog({
        logFile: config.logging!.file,
        mode: 'safe',
        model: args.model || config.model,
        tracker,
        metrics,
      })
    } catch (error: unknown) {
      logger.warn('Failed to persist usage log', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Setup graceful shutdown
  shutdown.onShutdown(async () => {
    process.stderr.write('💾 Saving session...\n')
    await sessionManager.save()
  })

  shutdown.onShutdown(async () => {
    process.stderr.write('📝 Closing logs...\n')
    await logger.close()
  })

  shutdown.onShutdown(async () => {
    tracker.printSummary()
    metrics.printSummary()
    await persistUsage()
  })

  // Initialize components
  const tools = await createToolRegistry()
  const hookManager = createHookManager(config.hooks as any)

  // Start embedded MCP server if configured
  if (config.mcp?.expose) {
    const { startMcpServer } = await import('@/core/mcp/server')
    startMcpServer(config, tools).catch((err: Error) =>
      logger.warn('MCP server failed to start', { error: err.message })
    )
  }

  const model = ModelFactory.create({
    type: config.provider || 'anthropic',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: args.model || config.model,
  })

  // Create session
  await sessionManager.createSession('safe', config.model)

  const loop = new AgentLoop({
    model,
    tools,
    permissionContext: buildPermissionContext('default'),
    logger,
    streaming: true,
    hooks: hookManager,
  })

  tools.hooks = hookManager

  const message = args.message || (await promptUser())
  await loop.run(message)

  // Save session
  await sessionManager.save()

  // Print summaries
  tracker.printSummary()
  metrics.printSummary()
  await persistUsage()
}

async function promptUser(): Promise<string> {
  process.stderr.write('Enter your request:\n')
  const decoder = new TextDecoder()
  let input = ''
  for await (const chunk of Bun.stdin.stream()) {
    input += decoder.decode(chunk as Uint8Array)
    if (input.includes('\n')) break
  }
  return input.trim()
}
