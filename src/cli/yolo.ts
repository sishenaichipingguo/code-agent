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
import { initMemoryManager, getMemoryManager } from '@/core/tools/memory'

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
  const model = ModelFactory.create({
    type: config.provider || 'anthropic',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: args.model || config.model
  })

  // Initialize memory manager so memory tools work and MEMORY.md can be injected
  initMemoryManager(process.cwd())

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
  const contextManager = new ContextManager(model, modelName)

  // Build full system prompt: role rules + env info + MEMORY.md + CLAUDE.md
  let memoryMgr: ReturnType<typeof getMemoryManager> | undefined
  try { memoryMgr = getMemoryManager() } catch { /* not initialized */ }
  const systemPrompt = await new SystemPromptBuilder(process.cwd(), memoryMgr).build()
  logger.debug('System prompt built', { length: systemPrompt.length })

  const loop = new AgentLoop({
    model,
    tools,
    mode: 'yolo',
    logger,
    streaming: true,
    contextManager,
    systemPrompt,
    initialMessages,
    sessionManager
  })

  const message = args.message || await promptUser()

  await loop.run(message)

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
