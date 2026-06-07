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

export async function runYoloUI(args: Args) {
  const config = await loadConfig()
  const logger = initLogger(config.logging!)
  initTokenTracker()
  initMetrics()
  const shutdown = new GracefulShutdown()
  const sessionManager = new SessionManager()

  logger.info('Starting in YOLO mode with UI')

  shutdown.onShutdown(async () => {
    await sessionManager.save()
    await logger.close()
  })

  const tools = await createToolRegistry()
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
