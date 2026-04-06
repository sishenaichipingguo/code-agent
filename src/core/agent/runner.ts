// SubAgent runtime entry point — runs a real AgentLoop in an isolated process
import { createToolRegistry } from '../tools/registry'
import { ModelFactory } from '../models/factory'
import { AgentLoop } from './loop'
import { initLogger } from '@/infra/logger'
import { initTokenTracker } from '@/infra/token-tracker'
import { initMetrics } from '@/infra/metrics'
import { buildPermissionContext, enterAutoMode } from '@/core/permissions'
import { initMemoryManager } from '@/core/tools/memory'

async function main() {
  const type = process.env.SUBAGENT_TYPE!
  const promptBase64 = process.env.SUBAGENT_PROMPT!
  const prompt = Buffer.from(promptBase64, 'base64').toString('utf-8')
  const allowedTools: string[] = JSON.parse(process.env.SUBAGENT_TOOLS!)
  const systemPrompt = process.env.SUBAGENT_SYSTEM ?? ''
  const provider = (process.env.SUBAGENT_PROVIDER ?? 'anthropic') as any
  const model = process.env.SUBAGENT_MODEL ?? 'claude-sonnet-4'
  const apiKey = process.env.SUBAGENT_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? ''
  const baseUrl = process.env.SUBAGENT_BASE_URL
  const maxTokens = parseInt(process.env.SUBAGENT_MAX_TOKENS ?? '4096', 10)

  // All diagnostic output goes to stderr so stdout stays clean for the JSON result
  const logger = initLogger({ level: 'info', file: `.agent/logs/subagent-${type}.log` })
  initTokenTracker()
  initMetrics()
  initMemoryManager(process.cwd())

  try {
    logger.info('SubAgent starting', { type, provider, model })

    const modelAdapter = ModelFactory.create({ type: provider, apiKey, baseUrl, model })

    const fullRegistry = await createToolRegistry()
    const restrictedRegistry = fullRegistry.createRestricted(allowedTools)

    const loop = new AgentLoop({
      model: modelAdapter,
      tools: restrictedRegistry,
      permissionContext: enterAutoMode(buildPermissionContext('default')),
      logger,
      streaming: false
    })

    const result = await loop.run(prompt)

    // Only the final JSON goes to stdout
    process.stdout.write(JSON.stringify({
      success: true,
      result,
      metadata: { type, model, toolsUsed: allowedTools }
    }) + '\n')

    process.exit(0)
  } catch (error: any) {
    logger.error('SubAgent failed', { error: error.message })
    process.stdout.write(JSON.stringify({
      success: false,
      error: error.message
    }) + '\n')
    process.exit(1)
  }
}

main()
