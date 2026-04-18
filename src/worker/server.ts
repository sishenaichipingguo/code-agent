import express from 'express'
import cors from 'cors'
import { SQLiteManager } from './db/sqlite'
import { SDKAgent } from './agents/observer'
import { SessionManager } from './session/manager'
import type {
  SessionInitRequest,
  SessionInitResponse,
  ObservationRequest,
  ObservationResponse,
  SummarizeRequest,
  SummarizeResponse,
  SessionCompleteRequest,
  SessionCompleteResponse,
  SessionStatusResponse,
  SearchRequest,
  SearchResponse
} from './types'
import { homedir } from 'os'
import { join } from 'path'

const PORT = process.env.WORKER_PORT ? parseInt(process.env.WORKER_PORT) : 37777
const DATA_DIR = process.env.WORKER_DATA_DIR || join(homedir(), '.claude-mem')
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const WORKER_MODEL = process.env.WORKER_MODEL || 'claude-3-5-sonnet-20241022'

if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required')
  process.exit(1)
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

// Initialize core components
const db = new SQLiteManager(DATA_DIR)
const agent = new SDKAgent(ANTHROPIC_API_KEY, WORKER_MODEL)
const sessionManager = new SessionManager(db, agent)

// ============ Session Routes ============

app.post('/api/sessions/init', async (req, res) => {
  try {
    const body = req.body as SessionInitRequest

    // 简单的项目排除逻辑（可扩展）
    const excludedProjects = process.env.EXCLUDED_PROJECTS?.split(',') || []
    if (excludedProjects.includes(body.project)) {
      return res.json({
        sessionDbId: -1,
        promptNumber: 0,
        skipped: true,
        reason: 'Project is in excluded list'
      } as SessionInitResponse)
    }

    const result = await sessionManager.initSession({
      contentSessionId: body.contentSessionId,
      project: body.project,
      platformSource: body.platformSource,
      cwd: body.cwd || process.cwd(),
      prompt: body.prompt
    })

    res.json({
      sessionDbId: result.sessionDbId,
      promptNumber: result.promptNumber
    } as SessionInitResponse)
  } catch (error: any) {
    console.error('Session init error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/sessions/observations', async (req, res) => {
  try {
    const body = req.body as ObservationRequest

    const result = await sessionManager.addObservation({
      contentSessionId: body.contentSessionId,
      toolName: body.toolName,
      toolInput: body.toolInput,
      toolResponse: body.toolResponse
    })

    res.json({
      observationId: result.observationId,
      queued: true
    } as ObservationResponse)
  } catch (error: any) {
    console.error('Observation error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/sessions/summarize', async (req, res) => {
  try {
    const body = req.body as SummarizeRequest

    const result = await sessionManager.addSummary({
      contentSessionId: body.contentSessionId,
      lastAssistantMessage: body.lastAssistantMessage
    })

    res.json({
      summaryId: result.summaryId,
      queued: true
    } as SummarizeResponse)
  } catch (error: any) {
    console.error('Summarize error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.post('/api/sessions/complete', async (req, res) => {
  try {
    const body = req.body as SessionCompleteRequest

    sessionManager.completeSession(body.contentSessionId)

    res.json({
      success: true
    } as SessionCompleteResponse)
  } catch (error: any) {
    console.error('Session complete error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/sessions/status/:contentSessionId', async (req, res) => {
  try {
    const { contentSessionId } = req.params

    const status = sessionManager.getQueueStatus(contentSessionId)

    res.json({
      queueLength: status.queueLength,
      processing: status.processing
    } as SessionStatusResponse)
  } catch (error: any) {
    console.error('Session status error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============ Search Routes ============

app.get('/api/search', async (req, res) => {
  try {
    const query = req.query as any
    const params: SearchRequest = {
      query: query.q,
      project: query.project,
      type: query.type,
      startDate: query.startDate ? parseInt(query.startDate) : undefined,
      endDate: query.endDate ? parseInt(query.endDate) : undefined,
      limit: query.limit ? parseInt(query.limit) : 50,
      offset: query.offset ? parseInt(query.offset) : 0
    }

    // 目前只实现 SQLite 搜索，ChromaDB 语义搜索留待后续
    const result = db.searchObservations({
      project: params.project,
      type: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
      limit: params.limit,
      offset: params.offset
    })

    res.json({
      observations: result.observations,
      total: result.total,
      fellBack: false
    } as SearchResponse)
  } catch (error: any) {
    console.error('Search error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============ Health Check ============

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

// ============ Start Server ============

app.listen(PORT, () => {
  console.log(`🚀 Worker Service running on http://localhost:${PORT}`)
  console.log(`📁 Data directory: ${DATA_DIR}`)
  console.log(`🔑 API Key: ${ANTHROPIC_API_KEY.slice(0, 10)}...`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing database...')
  db.close()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, closing database...')
  db.close()
  process.exit(0)
})
