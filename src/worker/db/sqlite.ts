import { Database } from 'bun:sqlite'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { Session, Observation, Summary, UserPrompt } from '../types'

export class SQLiteManager {
  private db: Database

  constructor(dataDir: string) {
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    const dbPath = join(dataDir, 'claude-mem.db')
    this.db = new Database(dbPath)
    this.initSchema()
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_session_id TEXT NOT NULL UNIQUE,
        project TEXT NOT NULL,
        platform_source TEXT NOT NULL,
        cwd TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        prompt_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(session_id);
      CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
      CREATE INDEX IF NOT EXISTS idx_observations_created_at ON observations(created_at);

      CREATE TABLE IF NOT EXISTS summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id);

      CREATE TABLE IF NOT EXISTS user_prompts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        prompt_number INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_prompts_session ON user_prompts(session_id);
    `)
  }

  // ============ Sessions ============

  createSession(data: {
    contentSessionId: string
    project: string
    platformSource: string
    cwd: string
  }): Session {
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO sessions (content_session_id, project, platform_source, cwd, created_at, updated_at, prompt_count)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `)

    const result = stmt.run(
      data.contentSessionId,
      data.project,
      data.platformSource,
      data.cwd,
      now,
      now
    )

    return {
      id: result.lastInsertRowid as number,
      contentSessionId: data.contentSessionId,
      project: data.project,
      platformSource: data.platformSource as any,
      cwd: data.cwd,
      createdAt: now,
      updatedAt: now,
      promptCount: 0
    }
  }

  getSessionByContentId(contentSessionId: string): Session | null {
    const stmt = this.db.prepare(`
      SELECT id, content_session_id, project, platform_source, cwd, created_at, updated_at, prompt_count
      FROM sessions
      WHERE content_session_id = ?
    `)

    const row = stmt.get(contentSessionId) as any
    if (!row) return null

    return {
      id: row.id,
      contentSessionId: row.content_session_id,
      project: row.project,
      platformSource: row.platform_source,
      cwd: row.cwd,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      promptCount: row.prompt_count
    }
  }

  incrementPromptCount(sessionId: number): void {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET prompt_count = prompt_count + 1, updated_at = ?
      WHERE id = ?
    `)
    stmt.run(Date.now(), sessionId)
  }

  // ============ Observations ============

  createObservation(data: {
    sessionId: number
    type: string
    content: string
    metadata: Record<string, any>
  }): Observation {
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO observations (session_id, type, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      data.sessionId,
      data.type,
      data.content,
      JSON.stringify(data.metadata),
      now
    )

    return {
      id: result.lastInsertRowid as number,
      sessionId: data.sessionId,
      type: data.type as any,
      content: data.content,
      metadata: data.metadata,
      createdAt: now
    }
  }

  getObservationsBySession(sessionId: number): Observation[] {
    const stmt = this.db.prepare(`
      SELECT id, session_id, type, content, metadata, created_at
      FROM observations
      WHERE session_id = ?
      ORDER BY created_at DESC
    `)

    const rows = stmt.all(sessionId) as any[]
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      type: row.type,
      content: row.content,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at
    }))
  }

  searchObservations(params: {
    project?: string
    type?: string
    startDate?: number
    endDate?: number
    limit?: number
    offset?: number
  }): { observations: Observation[]; total: number } {
    let whereClause = '1=1'
    const bindings: any[] = []

    if (params.project) {
      whereClause += ' AND s.project = ?'
      bindings.push(params.project)
    }

    if (params.type) {
      whereClause += ' AND o.type = ?'
      bindings.push(params.type)
    }

    if (params.startDate) {
      whereClause += ' AND o.created_at >= ?'
      bindings.push(params.startDate)
    }

    if (params.endDate) {
      whereClause += ' AND o.created_at <= ?'
      bindings.push(params.endDate)
    }

    // Get total count
    const countStmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM observations o
      JOIN sessions s ON o.session_id = s.id
      WHERE ${whereClause}
    `)
    const countRow = countStmt.get(...bindings) as any
    const total = countRow.count

    // Get paginated results
    const limit = params.limit ?? 50
    const offset = params.offset ?? 0

    const stmt = this.db.prepare(`
      SELECT o.id, o.session_id, o.type, o.content, o.metadata, o.created_at
      FROM observations o
      JOIN sessions s ON o.session_id = s.id
      WHERE ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `)

    const rows = stmt.all(...bindings, limit, offset) as any[]
    const observations = rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      type: row.type,
      content: row.content,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at
    }))

    return { observations, total }
  }

  // ============ Summaries ============

  createSummary(data: {
    sessionId: number
    content: string
  }): Summary {
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO summaries (session_id, content, created_at)
      VALUES (?, ?, ?)
    `)

    const result = stmt.run(data.sessionId, data.content, now)

    return {
      id: result.lastInsertRowid as number,
      sessionId: data.sessionId,
      content: data.content,
      createdAt: now
    }
  }

  getSummariesBySession(sessionId: number): Summary[] {
    const stmt = this.db.prepare(`
      SELECT id, session_id, content, created_at
      FROM summaries
      WHERE session_id = ?
      ORDER BY created_at DESC
    `)

    const rows = stmt.all(sessionId) as any[]
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      content: row.content,
      createdAt: row.created_at
    }))
  }

  // ============ User Prompts ============

  createUserPrompt(data: {
    sessionId: number
    promptNumber: number
    content: string
  }): UserPrompt {
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO user_prompts (session_id, prompt_number, content, created_at)
      VALUES (?, ?, ?, ?)
    `)

    const result = stmt.run(data.sessionId, data.promptNumber, data.content, now)

    return {
      id: result.lastInsertRowid as number,
      sessionId: data.sessionId,
      promptNumber: data.promptNumber,
      content: data.content,
      createdAt: now
    }
  }

  close() {
    this.db.close()
  }
}
