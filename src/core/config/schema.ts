import { z } from 'zod'

export const ConfigSchema = z.object({
  model: z.string().default('claude-sonnet-4'),
  mode: z.enum(['yolo', 'safe']).default('yolo'),
  apiKey: z.string().optional(),

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
  }).optional()
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
