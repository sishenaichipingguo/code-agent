import type { Args } from './parser'
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
import { getTokenTracker } from '@/infra/token-tracker'
import { getMetrics } from '@/infra/metrics'
import { getLogger } from '@/infra/logger'
import { AgentInitializer } from '@/core/agent/initializer'

export async function runYolo(args: Args) {
  const init = new AgentInitializer({
    cwd: process.cwd(),
    configPath: args.config,
    model: args.model
  })
  await init.setup()

  const { config, sessionManager } = init
  const logger = getLogger()

  logger.info('Starting in YOLO mode')

  const systemPrompt = await init.buildSystemPrompt()
  logger.debug('System prompt built', { length: systemPrompt.length })

  // Resume session if requested
  let initialMessages: Array<{ role: 'user' | 'assistant'; content: any }> = []
  if (args.session || args.resume) {
    const existing = args.session
      ? await sessionManager.loadSession(args.session)
      : await sessionManager.loadLast()

    if (existing) {
      initialMessages = existing.messages.map(({ role, content }) => ({ role, content }))
      process.stderr.write(`↩ Resuming session ${existing.id} (${initialMessages.length} messages)\n`)
      logger.info('Resuming session', { id: existing.id, messages: initialMessages.length })
    } else {
      process.stderr.write('⚠ No session found, starting fresh\n')
    }
  }

  await sessionManager.createSession('yolo', config.model)

  const loop = init.buildLoop({
    permissionMode: 'bypass',
    systemPrompt,
    initialMessages
  })

  init.registerShutdownHandlers(loop)

  // Slash commands & plugins
  const registry = new SlashCommandRegistry()

  const pluginManager = new PluginManager([
    join(process.cwd(), '.agent', 'plugins'),
    join(os.homedir(), '.agent', 'plugins')
  ])
  await pluginManager.discover()

  const skillLoader = new SkillLoader([
    join(os.homedir(), '.agent', 'skills'),
    join(process.cwd(), '.agent', 'skills'),
    ...pluginManager.getSkillDirs()
  ])
  await skillLoader.loadInto(registry)

  registry.register({ name: 'compact', description: 'Compress conversation context', args: 'none', handler: compactHandler }, -1)
  registry.register({ name: 'cost', description: 'Show token usage and cost', args: 'none', handler: costHandler }, -1)
  registry.register({ name: 'clear', description: 'Clear conversation history', args: 'none', handler: clearHandler }, -1)
  registry.register({ name: 'model', description: 'Show current model', args: 'optional', handler: modelHandler }, -1)
  registry.register({ name: 'session', description: 'Show current session info', args: 'none', handler: sessionHandler }, -1)
  registry.register({ name: 'memory', description: 'Show memory index', args: 'none', handler: memoryHandler }, -1)
  registry.register({ name: 'skills', description: 'List loaded skill commands', args: 'none', handler: makeSkillsHandler(registry) }, -1)
  registry.register({ name: 'plugins', description: 'List loaded plugins', args: 'none', handler: makePluginsHandler(pluginManager) }, -1)
  registry.register({ name: 'help', description: 'List all available commands', args: 'none', handler: makeHelpHandler(registry) }, -1)

  const rawMessage = args.message || await promptUser()
  const tracker = getTokenTracker()
  const cmdCtx = { args: '', loop, config, tokenTracker: tracker, sessionManager }
  const dispatchResult = await registry.dispatch(rawMessage, cmdCtx)

  if (dispatchResult.type === 'inject') {
    await loop.run(dispatchResult.message)
  } else if (dispatchResult.type === 'unknown') {
    await loop.run(rawMessage)
  }

  await sessionManager.save()
  tracker.printSummary()
  getMetrics().printSummary()
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
