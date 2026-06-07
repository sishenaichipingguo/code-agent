import React from 'react'
import { render } from 'ink'
import type { Args } from './parser'
import { loadConfig } from '@/core/config/loader'
import { initLogger } from '@/infra/logger'
import { initTokenTracker } from '@/infra/token-tracker'
import { initMetrics } from '@/infra/metrics'
import { GracefulShutdown } from '@/infra/graceful-shutdown'
import { createToolRegistry } from '@/core/tools/registry'
import { ModelFactory } from '@/core/models/factory'
import { SessionManager } from '@/core/session/manager'
import { AgentLoop } from '@/core/agent/loop'
import { buildPermissionContext } from '@/core/permissions'
import { SystemPromptBuilder } from '@/core/system-prompt/builder'
import { initMemoryManager, getMemoryManager } from '@/core/tools/memory'
import { App } from '@/ui/App'
import { WorkerManager } from '@/worker/manager'
import { createMemoryHooks } from '@/worker/hooks'
import { createHookManager } from '@/core/hooks/manager'
import os from 'os'
import { join } from 'path'

export async function runYoloUI(args: Args) {
  const config = await loadConfig()
  const logger = initLogger(config.logging!)
  initTokenTracker()
  initMetrics()
  const shutdown = new GracefulShutdown()
  const sessionManager = new SessionManager()

  logger.info('Starting in YOLO mode with UI')

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
    await sessionManager.save()
    await logger.close()
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

  const model = ModelFactory.create({
    type: config.provider || 'anthropic',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: args.model || config.model
  })

  initMemoryManager(process.cwd())
  let memoryMgr: ReturnType<typeof getMemoryManager> | undefined
  try { memoryMgr = getMemoryManager() } catch { /* not initialized */ }
  const systemPrompt = await new SystemPromptBuilder(process.cwd(), memoryMgr).build()

  await sessionManager.createSession('yolo', config.model)

  const loop = new AgentLoop({
    model,
    tools,
    permissionContext: buildPermissionContext('bypass'),
    logger,
    streaming: true,
    systemPrompt,
    sessionManager,
    hooks: hookManager
  })

  const onMessage = async function* (text: string) {
    const queue: any[] = []
    let resolve: (() => void) | null = null
    let done = false

    loop.context.onChunk = (chunk: any) => {
      queue.push(chunk)
      resolve?.()
      resolve = null
    }

    loop.run(text).then(() => {
      done = true
      resolve?.()
      resolve = null
    })

    while (true) {
      while (queue.length > 0) {
        yield queue.shift()
      }
      if (done) break
      await new Promise<void>(r => { resolve = r })
    }
  }

  render(
    <App
      model={config.model}
      mode="yolo"
      onMessage={onMessage}
    />
  )
}
