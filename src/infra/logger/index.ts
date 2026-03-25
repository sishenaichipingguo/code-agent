// Lightweight logger with zero performance overhead
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogMode = 'yolo' | 'safe'

export interface LogEntry {
  level: LogLevel
  timestamp: number
  message: string
  meta?: Record<string, any>
}

export interface Logger {
  debug(msg: string, meta?: Record<string, any>): void
  info(msg: string, meta?: Record<string, any>): void
  warn(msg: string, meta?: Record<string, any>): void
  error(msg: string, meta?: Record<string, any>): void
}

class FastLogger implements Logger {
  private buffer: LogEntry[] = []
  private mode: LogMode

  constructor(mode: LogMode) {
    this.mode = mode
  }

  debug(msg: string, meta?: Record<string, any>) {
    this.log('debug', msg, meta)
  }

  info(msg: string, meta?: Record<string, any>) {
    this.log('info', msg, meta)
  }

  warn(msg: string, meta?: Record<string, any>) {
    this.log('warn', msg, meta)
  }

  error(msg: string, meta?: Record<string, any>) {
    this.log('error', msg, meta)
  }

  private log(level: LogLevel, message: string, meta?: Record<string, any>) {
    const entry: LogEntry = {
      level,
      timestamp: Date.now(),
      message,
      meta
    }

    // YOLO mode: only buffer errors
    if (this.mode === 'yolo' && level !== 'error') {
      return
    }

    // Console output for errors
    if (level === 'error') {
      console.error(`[ERROR] ${message}`, meta || '')
    }

    // Buffer for potential file write
    this.buffer.push(entry)
    if (this.buffer.length > 100) {
      this.buffer.shift()
    }
  }
}

export function createLogger(config: { mode: LogMode }): Logger {
  return new FastLogger(config.mode)
}
