import type { Args } from './parser'
import { initLogger, getLogger } from '@/infra/logger'
import { SlashCommandRegistry } from '@/core/slash/registry'
import { SkillLoader } from '@/core/slash/skill-loader'
import { PluginManager } from '@/core/plugins/manager'
import { compactHandler } from '@/core/slash/builtins/compact'
import { costHandler } from '@/core/slash/builtins/cost'
import { clearHandler } from '@/core/slash/builtins/clear'
import { modelHandler } from '@/core/slash/builtins/model'
import { sessionHandler } from '@/core/slash/builtins/session'
import { memoryHandler } from '@/core/slash/builtins/memory'
import { makeHelpHandler } from '@/core/slash/builtins/help'
import { makeSkillsHandler } from '@/core/slash/builtins/skills'
import { makePluginsHandler } from '@/core/slash/builtins/plugins'
import os from 'os'
import { join } from 'path'
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
import { WorkerManager } from '@/worker/manager'
import { createMemoryHooks } from '@/worker/hooks'

export async function runYolo(args: Args) {
  const config = await loadConfig(args.config)

  const logger = initLogger(config.logging!)
  const tracker = initTokenTracker()
  const metrics = initMetrics()
  const shutdown = new GracefulShutdown()
  const sessionManager = new SessionManager()

  logger.info('Starting in YOLO mode')

  // Start Worker Service if memory is enabled
  let workerManager: WorkerManager | undefined
  if (args.withMemory) {
    const apiKey = process.env.ANTHROPIC_API_KEY || config.apiKey
    if (!apiKey) {
      process.stderr.write('⚠️  Memory system requires ANTHROPIC_API_KEY\n')
      process.stderr.write('   Set it with: export ANTHROPIC_API_KEY="your-key"\n')
      process.stderr.write('   Continuing without memory...\n')
    } else {
      try {
        process.stderr.write('🧠 Starting memory system...\n')
        workerManager = new WorkerManager({
          apiKey,
          verbose: args.verbose,
          dataDir: join(os.homedir(), '.claude-mem')
        })
        await workerManager.start()

        // Wait for health check
        const healthy = await workerManager.waitForHealth()
        if (!healthy) {
          throw new Error('Worker health check failed')
        }

        logger.info('Memory system started', { port: workerManager.getPort() })
      } catch (error: any) {
        process.stderr.write(`⚠️  Failed to start memory system: ${error.message}\n`)
        process.stderr.write('   Continuing without memory...\n')
        workerManager = undefined
      }
    }
  }

  // Register Worker cleanup
  if (workerManager) {
    shutdown.onShutdown(async () => {
      process.stderr.write('🧠 Stopping memory system...\n')
      workerManager!.stop()
    })
  }

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

  // Auto-inject Hook configuration if memory is enabled
  let hookManager = createHookManager(config.hooks as any)
  if (workerManager) {
    const memoryHooks = createMemoryHooks(workerManager.getPort(), args.verbose)
    // Merge existing hooks and memory hooks
    const mergedHooks = { ...config.hooks, ...memoryHooks }
    hookManager = createHookManager(mergedHooks as any)
    logger.info('Memory hooks injected')

    // Show tip for non-verbose mode
    if (!args.verbose) {
      process.stderr.write('💡 Tip: Use --verbose to see detailed memory recording logs\n')
    }
  }

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

  // Build slash command registry
  const registry = new SlashCommandRegistry()

  // Discover plugins (project-level then user-level, user has higher priority)
  const pluginManager = new PluginManager([
    join(process.cwd(), '.agent', 'plugins'),
    join(os.homedir(), '.agent', 'plugins')
  ])
  await pluginManager.discover()

  // Load skills: user < project < plugin (later = higher priority)
  const skillLoader = new SkillLoader([
    join(os.homedir(), '.agent', 'skills'),
    join(process.cwd(), '.agent', 'skills'),
    ...pluginManager.getSkillDirs()
  ])
  await skillLoader.loadInto(registry)

  // Register built-in commands (priority -1 so skills can override)
  registry.register({ name: 'compact', description: 'Compress conversation context', args: 'none', handler: compactHandler }, -1)
  registry.register({ name: 'cost', description: 'Show token usage and cost', args: 'none', handler: costHandler }, -1)
  registry.register({ name: 'clear', description: 'Clear conversation history', args: 'none', handler: clearHandler }, -1)
  registry.register({ name: 'model', description: 'Show current model', args: 'optional', handler: modelHandler }, -1)
  registry.register({ name: 'session', description: 'Show current session info', args: 'none', handler: sessionHandler }, -1)
  registry.register({ name: 'memory', description: 'Show memory index', args: 'none', handler: memoryHandler }, -1)
  registry.register({ name: 'skills', description: 'List loaded skill commands', args: 'none', handler: makeSkillsHandler(registry) }, -1)
  registry.register({ name: 'plugins', description: 'List loaded plugins', args: 'none', handler: makePluginsHandler(pluginManager) }, -1)
  registry.register({ name: 'help', description: 'List all available commands', args: 'none', handler: makeHelpHandler(registry) }, -1)

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
  const cmdCtx = { args: '', loop, config, tokenTracker: tracker, sessionManager }
  const dispatchResult = await registry.dispatch(rawMessage, cmdCtx)

  if (dispatchResult.type === 'inject') {
    await loop.run(dispatchResult.message)
  } else if (dispatchResult.type === 'unknown') {
    await loop.run(rawMessage)
  }
  // type === 'handled' → command already ran, nothing more to do

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
