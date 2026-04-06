import { loadConfig } from '@/core/config/loader'
import type { Config } from '@/core/config/schema'
import { initLogger, getLogger } from '@/infra/logger'
import { initTokenTracker } from '@/infra/token-tracker'
import { initMetrics } from '@/infra/metrics'
import { GracefulShutdown } from '@/infra/graceful-shutdown'
import { createToolRegistry, type ToolRegistry } from '@/core/tools/registry'
import { ModelFactory } from '@/core/models/factory'
import type { ModelAdapter } from '@/core/models/adapter'
import { SessionManager } from '@/core/session/manager'
import { createHookManager, type HookManager } from '@/core/hooks/manager'
import { ContextManager } from '@/core/context/manager'
import { SystemPromptBuilder } from '@/core/system-prompt/builder'
import { initMemoryManager, getMemoryManager, initTeamStore, getTeamStore } from '@/core/tools/memory'
import { initAgentDispatcher } from '@/core/tools/agent'
import { SessionStore } from '@/core/memory/session-store'
import { AutoExtractor } from '@/core/memory/auto-extractor'
import { buildPermissionContext } from '@/core/permissions'
import { AgentLoop, type AgentContext } from '@/core/agent/loop'
import type { TeamStore } from '@/core/memory/team-store'

export interface AgentInitOptions {
  cwd?: string
  configPath?: string
  model?: string
  disableMemory?: boolean
}

export interface BuildLoopOptions {
  permissionMode: 'bypass' | 'default'
  systemPrompt?: string
  initialMessages?: Array<{ role: 'user' | 'assistant'; content: any }>
  streaming?: boolean
}

export class AgentInitializer {
  private _config!: Config
  private _model!: ModelAdapter
  private _tools!: ToolRegistry
  private _hookManager: HookManager | undefined
  private _sessionManager!: SessionManager
  private _sessionStore!: SessionStore
  private _contextManager!: ContextManager
  private _autoExtractor: AutoExtractor | undefined
  private _teamStore: TeamStore | undefined

  readonly shutdown: GracefulShutdown
  private readonly opts: Required<Pick<AgentInitOptions, 'cwd'>> & AgentInitOptions

  constructor(opts: AgentInitOptions = {}) {
    this.opts = { cwd: process.cwd(), ...opts }
    this.shutdown = new GracefulShutdown()
  }

  async setup(): Promise<void> {
    const { cwd, configPath, model: modelOverride } = this.opts

    this._config = await loadConfig(configPath)

    initLogger(this._config.logging!)
    initTokenTracker()
    initMetrics()

    this._sessionManager = new SessionManager()

    this._tools = await createToolRegistry()
    this._hookManager = createHookManager(this._config.hooks)
    if (this._hookManager) {
      this._tools.hooks = this._hookManager
    }

    if (this._config.mcp?.expose) {
      const logger = getLogger()
      const { startMcpServer } = await import('@/core/mcp/server')
      startMcpServer(this._config, this._tools).catch((err: Error) =>
        logger.warn('MCP server failed to start', { error: err.message })
      )
    }

    this._model = ModelFactory.create({
      type: this._config.provider || 'anthropic',
      baseUrl: this._config.baseUrl,
      apiKey: this._config.apiKey,
      model: modelOverride || this._config.model
    })

    if (!this.opts.disableMemory) {
      initMemoryManager(cwd)
      if (this._config.memory?.teamDir) {
        initTeamStore(this._config.memory.teamDir)
        try { this._teamStore = getTeamStore() } catch { /* not configured */ }
      }
      let memMgr: ReturnType<typeof getMemoryManager> | undefined
      try { memMgr = getMemoryManager() } catch { /* not initialized */ }
      if (memMgr) this._autoExtractor = new AutoExtractor(memMgr, this._model)
    }
    this._sessionStore = new SessionStore(cwd, this._model)

    initAgentDispatcher({
      provider: this._config.provider ?? 'anthropic',
      model: modelOverride || this._config.model,
      apiKey: this._config.apiKey,
      baseUrl: this._config.baseUrl
    })

    const modelName = modelOverride || this._config.model
    this._contextManager = new ContextManager(this._model, modelName, this._hookManager)
  }

  async buildSystemPrompt(): Promise<string> {
    let memMgr: ReturnType<typeof getMemoryManager> | undefined
    try { memMgr = getMemoryManager() } catch { /* not initialized */ }
    return new SystemPromptBuilder(
      this.opts.cwd,
      memMgr,
      this._sessionStore,
      this._teamStore
    ).build()
  }

  buildLoop(opts: BuildLoopOptions): AgentLoop {
    const { permissionMode, systemPrompt, initialMessages, streaming = true } = opts
    const ctx: AgentContext = {
      model: this._model,
      tools: this._tools,
      permissionContext: buildPermissionContext(permissionMode === 'bypass' ? 'bypass' : 'default'),
      logger: getLogger(),
      streaming,
      contextManager: this._contextManager,
      systemPrompt,
      initialMessages,
      sessionManager: this._sessionManager,
      hooks: this._hookManager
    }
    return new AgentLoop(ctx)
  }

  registerShutdownHandlers(loop: AgentLoop): void {
    const { shutdown, _sessionManager, _sessionStore, _autoExtractor, _config } = this

    shutdown.onShutdown(async () => {
      process.stderr.write('Saving session...\n')
      await _sessionManager.save()
    })

    shutdown.onShutdown(async () => {
      process.stderr.write('Closing logs...\n')
      await getLogger().close()
    })

    shutdown.onShutdown(async () => {
      const msgs = loop.getMessages()
      if (msgs.length >= 2) {
        process.stderr.write('Saving session summary...\n')
        await _sessionStore.save(msgs)
      }
    })

    if (this._autoExtractor) {
      const extractor = this._autoExtractor
      shutdown.onShutdown(async () => {
        const msgs = loop.getMessages()
        const threshold = _config.memory?.extractThreshold ?? 6
        if (_config.memory?.autoExtract !== false && msgs.length >= threshold) {
          process.stderr.write('Extracting memories from session...\n')
          await extractor.extract(msgs)
        }
      })
    }
  }

  get config(): Config { return this._config }
  get model(): ModelAdapter { return this._model }
  get tools(): ToolRegistry { return this._tools }
  get hookManager(): HookManager | undefined { return this._hookManager }
  get sessionManager(): SessionManager { return this._sessionManager }
  get contextManager(): ContextManager { return this._contextManager }
}
