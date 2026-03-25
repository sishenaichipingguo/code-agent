import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { parse } from 'yaml'
import { homedir } from 'os'
import { join } from 'path'
import { ConfigSchema, DEFAULT_CONFIG, type Config } from './schema'

export class ConfigLoader {
  async load(): Promise<Config> {
    const configs = []

    // 1. Default config
    configs.push(DEFAULT_CONFIG)

    // 2. Global config (~/.agent/config.yml)
    const globalConfig = await this.loadYaml(
      join(homedir(), '.agent', 'config.yml')
    )
    if (globalConfig) configs.push(globalConfig)

    // 3. Project config (.agent.yml)
    const projectConfig = await this.loadYaml('.agent.yml')
    if (projectConfig) configs.push(projectConfig)

    // 4. Environment variables
    const envConfig = this.loadEnv()
    configs.push(envConfig)

    // 5. Merge and validate
    const merged = this.merge(...configs)
    return ConfigSchema.parse(merged)
  }

  private async loadYaml(path: string): Promise<Partial<Config> | null> {
    try {
      if (!existsSync(path)) return null
      const content = await readFile(path, 'utf-8')
      return parse(content)
    } catch {
      return null
    }
  }

  private loadEnv(): Partial<Config> {
    const config: Partial<Config> = {}

    if (process.env.ANTHROPIC_API_KEY) {
      config.apiKey = process.env.ANTHROPIC_API_KEY
    }

    if (process.env.AGENT_MODE === 'safe' || process.env.AGENT_MODE === 'yolo') {
      config.mode = process.env.AGENT_MODE
    }

    if (process.env.AGENT_MODEL) {
      config.model = process.env.AGENT_MODEL
    }

    return config
  }

  private merge(...configs: Partial<Config>[]): Config {
    return configs.reduce((acc, config) => ({
      ...acc,
      ...config,
      tools: { ...acc.tools, ...config.tools },
      session: { ...acc.session, ...config.session },
      logging: { ...acc.logging, ...config.logging }
    }), {} as Config)
  }
}

let globalConfig: Config | null = null

export async function loadConfig(): Promise<Config> {
  if (!globalConfig) {
    const loader = new ConfigLoader()
    globalConfig = await loader.load()
  }
  return globalConfig
}

export function getConfig(): Config {
  if (!globalConfig) {
    throw new Error('Config not initialized. Call loadConfig() first.')
  }
  return globalConfig
}
