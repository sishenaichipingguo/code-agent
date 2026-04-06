import { z } from 'zod'

const McpServerConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stdio'),
    command: z.string(),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).optional()
  }),
  z.object({
    type: z.literal('http'),
    url: z.string().url(),
    headers: z.record(z.string()).optional()
  })
])

const McpExposeSchema = z.object({
  tools: z.array(z.string()).default(['read', 'glob', 'grep', 'ls']),
  transport: z.enum(['stdio', 'http']).default('stdio'),
  port: z.number().default(3100)
})

export const ConfigSchema = z.object({
  model: z.string().default('claude-sonnet-4'),
  mode: z.enum(['yolo', 'safe']).default('yolo'),

  // Provider configuration
  provider: z.enum(['anthropic', 'ollama', 'openai', 'openai-compatible']).default('anthropic'),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),

  tools: z.object({
    bash: z.object({
      timeout: z.number().default(30000)
    }).optional(),
    rm: z.object({
      confirm: z.boolean().default(true)
    }).optional()
  }).optional(),

  session: z.object({
    autoSave: z.boolean().default(true),
    saveDir: z.string().default('.agent/sessions')
  }).optional(),

  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    file: z.string().default('.agent/logs/agent.log')
  }).optional(),

  mcp: z.object({
    servers: z.record(McpServerConfigSchema).optional(),
    expose: McpExposeSchema.optional()
  }).optional(),

  memory: z.object({
    teamDir: z.string().optional(),
    autoExtract: z.boolean().default(true),
    extractThreshold: z.number().default(6)
  }).optional(),

  hooks: z.record(
    z.enum([
      'session-start', 'session-end',
      'pre-tool', 'post-tool',
      'pre-compress', 'post-compress',
      'post-sampling'
    ]),
    z.array(z.object({
      command: z.string(),
      onError: z.enum(['warn', 'abort', 'ignore']).default('warn'),
      timeout: z.number().default(5000)
    }))
  ).optional()
})

export type Config = z.infer<typeof ConfigSchema>

export const DEFAULT_CONFIG: Config = {
  model: 'claude-sonnet-4',
  mode: 'yolo',
  session: {
    autoSave: true,
    saveDir: '.agent/sessions'
  },
  logging: {
    level: 'info',
    file: '.agent/logs/agent.log'
  }
}
