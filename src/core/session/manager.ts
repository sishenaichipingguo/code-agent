// Session management for context persistence

export interface Message {
  role: 'user' | 'assistant'
  content: any
  timestamp: number
}

export interface Session {
  id: string
  createdAt: number
  updatedAt: number
  messages: Message[]
  metadata: {
    model: string
    mode: 'yolo' | 'safe'
    toolsUsed: string[]
  }
}

export class SessionManager {
  private currentSession: Session | null = null
  private sessionsDir = '.agent/sessions'

  async createSession(mode: 'yolo' | 'safe', model: string): Promise<Session> {
    const session: Session = {
      id: this.generateId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      metadata: { model, mode, toolsUsed: [] }
    }

    this.currentSession = session
    return session
  }

  async saveMessage(role: 'user' | 'assistant', content: any) {
    if (!this.currentSession) return

    this.currentSession.messages.push({
      role,
      content,
      timestamp: Date.now()
    })

    this.currentSession.updatedAt = Date.now()
    await this.persist()
  }

  async loadSession(id: string): Promise<Session | null> {
    try {
      const path = `${this.sessionsDir}/${id}.json`
      const data = await Bun.file(path).text()
      this.currentSession = JSON.parse(data)
      return this.currentSession
    } catch {
      return null
    }
  }

  async loadLast(): Promise<Session | null> {
    try {
      await this.ensureDir(this.sessionsDir)
      const files = await Array.fromAsync(
        new Bun.Glob('*.json').scan({ cwd: this.sessionsDir })
      )

      if (files.length === 0) return null

      // Sort by modification time
      const sessions = await Promise.all(
        files.map(async (file) => {
          const path = `${this.sessionsDir}/${file}`
          const data = await Bun.file(path).text()
          return JSON.parse(data) as Session
        })
      )

      sessions.sort((a, b) => b.updatedAt - a.updatedAt)
      this.currentSession = sessions[0]
      return this.currentSession
    } catch {
      return null
    }
  }

  getCurrentSession(): Session | null {
    return this.currentSession
  }

  async save() {
    await this.persist()
  }

  private async persist() {
    if (!this.currentSession) return

    await this.ensureDir(this.sessionsDir)
    const path = `${this.sessionsDir}/${this.currentSession.id}.json`
    await Bun.write(path, JSON.stringify(this.currentSession, null, 2))
  }

  private generateId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  }

  private async ensureDir(dir: string) {
    await Bun.spawn(['mkdir', '-p', dir]).exited
  }
}
