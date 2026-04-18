import express from 'express'
import cors from 'cors'
import { SQLiteManager } from './db/sqlite'
import { SDKAgent } from './agents/observer'
import { SessionManager } from './session/manager'
import { ChromaManager } from './embedding/chroma'
import { initEmbeddingModel } from './embedding/generator'
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
  SearchResponse,
  RecallRequest,
  RecallResponse
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
const chroma = new ChromaManager(DATA_DIR)

// Initialize ChromaDB and embedding model
let isReady = false
;(async () => {
  try {
    console.log('🔄 Initializing embedding model...')
    await initEmbeddingModel()

    console.log('🔄 Initializing ChromaDB...')
    await chroma.init()

    isReady = true
    console.log('✅ Memory system fully initialized')
  } catch (error: any) {
    console.error('❌ Failed to initialize memory system:', error.message)
    process.exit(1)
  }
})()

const sessionManager = new SessionManager(db, agent, chroma)

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

// ============ Recall Routes ============

app.post('/api/recall', async (req, res) => {
  try {
    if (!isReady) {
      return res.status(503).json({ error: 'Memory system not ready yet' })
    }

    const body = req.body as RecallRequest

    // 使用 ChromaDB 进行语义搜索
    const results = await chroma.searchSimilar(body.query, {
      project: body.project,
      limit: body.limit || 10,
      minScore: 0.3
    })

    // 格式化为结构化文本
    const formattedMemories = formatMemoriesForPrompt(results)

    res.json({
      memories: results,
      formattedText: formattedMemories,
      count: results.length
    } as RecallResponse)
  } catch (error: any) {
    console.error('Recall error:', error)
    res.status(500).json({ error: error.message })
  }
})

function formatMemoriesForPrompt(memories: Array<{
  content: string
  type: string
  createdAt: number
  metadata: any
  score: number
}>): string {
  if (memories.length === 0) {
    return ''
  }

  const lines: string[] = ['## Relevant Past Context', '']

  // 按日期分组
  const byDate = new Map<string, typeof memories>()
  for (const mem of memories) {
    const date = new Date(mem.createdAt).toISOString().split('T')[0]
    if (!byDate.has(date)) {
      byDate.set(date, [])
    }
    byDate.get(date)!.push(mem)
  }

  // 格式化输出
  for (const [date, mems] of byDate) {
    lines.push(`From session on ${date}:`)
    for (const mem of mems) {
      lines.push(`- [${mem.type}] ${mem.content}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

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
