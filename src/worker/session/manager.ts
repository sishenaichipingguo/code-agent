import type { ActiveSession, QueuedMessage } from '../types'
import { SQLiteManager } from '../db/sqlite'
import { SDKAgent } from '../agents/observer'
import type { ChromaManager } from '../embedding/chroma'

export class SessionManager {
  private activeSessions = new Map<string, ActiveSession>()
  private processingLock = new Set<string>()

  constructor(
    private db: SQLiteManager,
    private agent: SDKAgent,
    private chroma?: ChromaManager
  ) {}

  async initSession(params: {
    contentSessionId: string
    project: string
    platformSource: string
    cwd: string
    prompt: string
  }): Promise<{ sessionDbId: number; promptNumber: number }> {
    // 检查是否已存在
    let session = this.db.getSessionByContentId(params.contentSessionId)

    if (!session) {
      // 创建新会话
      session = this.db.createSession({
        contentSessionId: params.contentSessionId,
        project: params.project,
        platformSource: params.platformSource,
        cwd: params.cwd
      })
    }

    // 增加 prompt 计数
    this.db.incrementPromptCount(session.id)
    const promptNumber = session.promptCount + 1

    // 保存用户 prompt
    this.db.createUserPrompt({
      sessionId: session.id,
      promptNumber,
      content: params.prompt
    })

    // 创建或获取 ActiveSession
    let activeSession = this.activeSessions.get(params.contentSessionId)
    if (!activeSession) {
      activeSession = {
        sessionDbId: session.id,
        contentSessionId: params.contentSessionId,
        project: params.project,
        cwd: params.cwd,
        messageQueue: [],
        processing: false
      }
      this.activeSessions.set(params.contentSessionId, activeSession)
    }

    // 加入初始化消息到队列
    activeSession.messageQueue.push({
      type: 'init',
      prompt: params.prompt,
      timestamp: Date.now()
    })

    // 异步处理队列
    this.processQueue(params.contentSessionId).catch(err => {
      console.error('Queue processing error:', err)
    })

    return { sessionDbId: session.id, promptNumber }
  }

  async addObservation(params: {
    contentSessionId: string
    toolName: string
    toolInput: any
    toolResponse: any
  }): Promise<{ observationId: number }> {
    const activeSession = this.activeSessions.get(params.contentSessionId)
    if (!activeSession) {
      throw new Error(`Session not found: ${params.contentSessionId}`)
    }

    // 加入队列
    activeSession.messageQueue.push({
      type: 'observation',
      toolName: params.toolName,
      toolInput: params.toolInput,
      toolResponse: params.toolResponse,
      timestamp: Date.now()
    })

    // 异步处理队列
    this.processQueue(params.contentSessionId).catch(err => {
      console.error('Queue processing error:', err)
    })

    // 返回临时 ID（实际 ID 在处理后生成）
    return { observationId: -1 }
  }

  async addSummary(params: {
    contentSessionId: string
    lastAssistantMessage: string
  }): Promise<{ summaryId: number }> {
    const activeSession = this.activeSessions.get(params.contentSessionId)
    if (!activeSession) {
      throw new Error(`Session not found: ${params.contentSessionId}`)
    }

    // 加入队列
    activeSession.messageQueue.push({
      type: 'summary',
      lastAssistantMessage: params.lastAssistantMessage,
      timestamp: Date.now()
    })

    // 异步处理队列
    this.processQueue(params.contentSessionId).catch(err => {
      console.error('Queue processing error:', err)
    })

    return { summaryId: -1 }
  }

  completeSession(contentSessionId: string): void {
    this.activeSessions.delete(contentSessionId)
    this.processingLock.delete(contentSessionId)
  }

  getQueueStatus(contentSessionId: string): { queueLength: number; processing: boolean } {
    const activeSession = this.activeSessions.get(contentSessionId)
    if (!activeSession) {
      return { queueLength: 0, processing: false }
    }

    return {
      queueLength: activeSession.messageQueue.length,
      processing: activeSession.processing
    }
  }

  private async processQueue(contentSessionId: string): Promise<void> {
    // 防止并发处理同一个队列
    if (this.processingLock.has(contentSessionId)) {
      return
    }

    const activeSession = this.activeSessions.get(contentSessionId)
    if (!activeSession || activeSession.messageQueue.length === 0) {
      return
    }

    this.processingLock.add(contentSessionId)
    activeSession.processing = true

    try {
      while (activeSession.messageQueue.length > 0) {
        const message = activeSession.messageQueue.shift()!

        if (message.type === 'init') {
          await this.processInitMessage(activeSession, message)
        } else if (message.type === 'observation') {
          await this.processObservationMessage(activeSession, message)
        } else if (message.type === 'summary') {
          await this.processSummaryMessage(activeSession, message)
        }

        activeSession.lastProcessedAt = Date.now()
      }
    } finally {
      activeSession.processing = false
      this.processingLock.delete(contentSessionId)
    }
  }

  private async processInitMessage(
    session: ActiveSession,
    message: Extract<QueuedMessage, { type: 'init' }>
  ): Promise<void> {
    try {
      const response = await this.agent.processInit({
        userPrompt: message.prompt,
        project: session.project,
        cwd: session.cwd
      })

      const parsed = this.agent.parseObservation(response)
      if (parsed) {
        const observation = this.db.createObservation({
          sessionId: session.sessionDbId,
          type: parsed.type,
          content: parsed.content,
          metadata: { source: 'init', prompt: message.prompt, project: session.project }
        })

        // 添加到 ChromaDB
        if (this.chroma) {
          await this.chroma.addObservation(observation).catch(err => {
            console.error('Failed to add observation to ChromaDB:', err.message)
          })
        }
      }
    } catch (error: any) {
      // Log error but don't throw - memory system should not block main flow
      console.error('Init message processing error:', error.message || error)
    }
  }

  private async processObservationMessage(
    session: ActiveSession,
    message: Extract<QueuedMessage, { type: 'observation' }>
  ): Promise<void> {
    try {
      const response = await this.agent.processContinuation({
        toolName: message.toolName,
        toolInput: message.toolInput,
        toolResponse: message.toolResponse
      })

      const parsed = this.agent.parseObservation(response)
      if (parsed) {
        const observation = this.db.createObservation({
          sessionId: session.sessionDbId,
          type: parsed.type,
          content: parsed.content,
          metadata: {
            source: 'tool_call',
            toolName: message.toolName,
            toolInput: message.toolInput,
            project: session.project
          }
        })

        // 添加到 ChromaDB
        if (this.chroma) {
          await this.chroma.addObservation(observation).catch(err => {
            console.error('Failed to add observation to ChromaDB:', err.message)
          })
        }
      }
    } catch (error: any) {
      // Log error but don't throw - memory system should not block main flow
      console.error('Observation message processing error:', error.message || error)
    }
  }

  private async processSummaryMessage(
    session: ActiveSession,
    message: Extract<QueuedMessage, { type: 'summary' }>
  ): Promise<void> {
    try {
      const response = await this.agent.processSummary({
        lastAssistantMessage: message.lastAssistantMessage
      })

      const parsed = this.agent.parseSummary(response)
      if (parsed) {
        this.db.createSummary({
          sessionId: session.sessionDbId,
          content: parsed
        })
      }
    } catch (error: any) {
      // Log error but don't throw - memory system should not block main flow
      console.error('Summary message processing error:', error.message || error)
    }
  }
}
