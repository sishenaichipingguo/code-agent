import React from 'react'
import { render } from 'ink'
import type { Args } from './parser'
import { getLogger } from '@/infra/logger'
import { AgentInitializer } from '@/core/agent/initializer'
import { App } from '@/ui/App'

export async function runYoloUI(args: Args) {
  const init = new AgentInitializer({
    cwd: process.cwd(),
    configPath: args.config,
    model: args.model
  })
  await init.setup()

  const { config, sessionManager, model, tools } = init
  const logger = getLogger()

  logger.info('Starting in YOLO mode with UI')

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
