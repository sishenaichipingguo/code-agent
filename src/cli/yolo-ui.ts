import React from 'react'
import { render } from 'ink'
import type { Args } from './parser'
import { loadConfig } from '@/core/config/loader'
import { initLogger } from '@/infra/logger'
import { initTokenTracker } from '@/infra/token-tracker'
import { initMetrics } from '@/infra/metrics'
import { GracefulShutdown } from '@/infra/graceful-shutdown'
import { createToolRegistry } from '@/core/tools/registry'
import { AnthropicAdapter } from '@/core/models/anthropic'
import { SessionManager } from '@/core/session/manager'
import { App } from '@/ui/App'

export async function runYoloUI(args: Args) {
  const config = await loadConfig()
  const logger = initLogger(config.logging!)
  const tracker = initTokenTracker()
  const metrics = initMetrics()
  const shutdown = new GracefulShutdown()
  const sessionManager = new SessionManager()

  logger.info('Starting in YOLO mode with UI')

  shutdown.onShutdown(async () => {
    await sessionManager.save()
    await logger.close()
    tracker.printSummary()
    metrics.printSummary()
  })

  const tools = createToolRegistry()
  const model = new AnthropicAdapter({
    apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY || '',
    model: args.model || config.model
  })

  await sessionManager.createSession('yolo', config.model)

  const handleMessage = async function* (text: string) {
    if (model.chatStream) {
      const stream = model.chatStream([{ role: 'user', content: text }], tools)
      for await (const chunk of stream) {
        yield chunk
      }
    }
  }

  render(
    <App
      model={config.model}
      mode="yolo"
      onMessage={handleMessage}
    />
  )
}
