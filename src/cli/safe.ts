import type { Args } from './parser'
import { initLogger } from '@/infra/logger'
import { initTokenTracker } from '@/infra/token-tracker'
import { initMetrics } from '@/infra/metrics'
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
    model: args.model || config.model
  })

  // Create session
  await sessionManager.createSession('safe', config.model)

  const loop = new AgentLoop({
    model,
    tools,
    permissionContext: buildPermissionContext('default'),
    logger,
    streaming: true,
    hooks: hookManager
  })

  tools.hooks = hookManager

  const message = args.message || await promptUser()
  await loop.run(message)

  // Save session
  await sessionManager.save()

  // Print summaries
  tracker.printSummary()
  metrics.printSummary()
}

async function promptUser(): Promise<string> {
  process.stderr.write('Enter your request:\n')
  const decoder = new TextDecoder()
  const buffer = new Uint8Array(1024)
  const n = await Bun.stdin.read(buffer)
  return decoder.decode(buffer.slice(0, n)).trim()
}
