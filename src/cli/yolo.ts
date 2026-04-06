import type { Args } from './parser'
import { initLogger, getLogger } from '@/infra/logger'
import { initTokenTracker, getTokenTracker } from '@/infra/token-tracker'
import { initMetrics, getMetrics } from '@/infra/metrics'
import { GracefulShutdown } from '@/infra/graceful-shutdown'
import { loadConfig } from '@/core/config/loader'
import { AgentLoop } from '@/core/agent/loop'
import { createToolRegistry } from '@/core/tools/registry'
import { ModelFactory } from '@/core/models/factory'
import { SessionManager } from '@/core/session/manager'
import { initAgentDispatcher } from '@/core/tools/agent'
import { ContextManager } from '@/core/context/manager'
import { SystemPromptBuilder } from '@/core/system-prompt/builder'
import { initMemoryManager, getMemoryManager, initTeamStore, getTeamStore } from '@/core/tools/memory'
import { buildPermissionContext } from '@/core/permissions'
import { SessionStore } from '@/core/memory/session-store'
import { createHookManager } from '@/core/hooks/manager'
import { AutoExtractor } from '@/core/memory/auto-extractor'
import type { TeamStore } from '@/core/memory/team-store'

export async function runYolo(args: Args) {
  const config = await loadConfig(args.config)

  const logger = initLogger(config.logging!)
  const tracker = initTokenTracker()
  const metrics = initMetrics()
  const shutdown = new GracefulShutdown()
  const sessionManager = new SessionManager()

  logger.info('Starting in YOLO mode')

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

  // Initialize memory manager so memory tools work and MEMORY.md can be injected
  initMemoryManager(process.cwd())
  let teamStoreMgr: TeamStore | undefined
  if (config.memory?.teamDir) {
    initTeamStore(config.memory.teamDir)
    try { teamStoreMgr = getTeamStore() } catch { /* teamDir not configured */ }
  }
  const sessionStore = new SessionStore(process.cwd(), model)

  // Initialize dispatcher with the same model config so subagents use the same provider
  initAgentDispatcher({
    provider: config.provider ?? 'anthropic',
    model: args.model || config.model,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl
  })

  logger.info('Using provider', { provider: model.name, model: config.model })

  await sessionManager.createSession('yolo', config.model)

  // Resume session if requested
  let initialMessages: Array<{ role: 'user' | 'assistant'; content: any }> = []
  if (args.session || args.resume) {
    const existing = args.session
      ? await sessionManager.loadSession(args.session)
      : await sessionManager.loadLast()

    if (existing) {
      // Strip timestamp — loop only needs role + content
      initialMessages = existing.messages.map(({ role, content }) => ({ role, content }))
      process.stderr.write(`↩ Resuming session ${existing.id} (${initialMessages.length} messages)\n`)
      logger.info('Resuming session', { id: existing.id, messages: initialMessages.length })
    } else {
      process.stderr.write('⚠ No session found, starting fresh\n')
    }
  }

  const modelName = args.model || config.model
  const contextManager = new ContextManager(model, modelName, hookManager)

  // Build full system prompt: role rules + env info + MEMORY.md + CLAUDE.md
  let memoryMgr: ReturnType<typeof getMemoryManager> | undefined
  try { memoryMgr = getMemoryManager() } catch { /* not initialized */ }
  let autoExtractor: AutoExtractor | undefined
  if (memoryMgr) autoExtractor = new AutoExtractor(memoryMgr, model)
  const systemPrompt = await new SystemPromptBuilder(process.cwd(), memoryMgr, sessionStore, teamStoreMgr).build()
  logger.debug('System prompt built', { length: systemPrompt.length })

  const loop = new AgentLoop({
    model,
    tools,
    permissionContext: buildPermissionContext('bypass'),
    logger,
    streaming: true,
    contextManager,
    systemPrompt,
    initialMessages,
    sessionManager,
    hooks: hookManager
  })

  tools.hooks = hookManager

  shutdown.onShutdown(async () => {
    const msgs = loop.getMessages()
    if (msgs.length >= 2) {
      process.stderr.write('🧠 Saving session summary...\n')
      await sessionStore.save(msgs)
    }
  })

  shutdown.onShutdown(async () => {
    if (!autoExtractor) return
    const msgs = loop.getMessages()
    const shouldExtract = config.memory?.autoExtract !== false &&
      msgs.length >= (config.memory?.extractThreshold ?? 6)
    if (shouldExtract) {
      process.stderr.write('🧠 Extracting memories from session...\n')
      await autoExtractor.extract(msgs)
    }
  })

  const rawMessage = args.message || await promptUser()

  if (rawMessage.trim().toLowerCase() === '/compact') {
    await loop.compact(loop.getMessages())
  } else {
    await loop.run(rawMessage)
  }

  await sessionManager.save()

  tracker.printSummary()
  metrics.printSummary()
}

async function promptUser(): Promise<string> {
  const readline = await import('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question('Enter your request: ', answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}
