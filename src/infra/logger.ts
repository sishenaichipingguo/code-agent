import { createWriteStream, mkdirSync, type WriteStream } from 'fs'
import { dirname } from 'path'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string
  level: string
  message: string
  context?: Record<string, unknown>
}

export class Logger {
  private level: LogLevel
  private logFile: string
  private stream?: WriteStream

  constructor(config: { level: string; file: string }) {
    this.level = this.parseLevel(config.level)
    this.logFile = config.file
    this.ensureLogDir()
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log(LogLevel.DEBUG, message, context)
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log(LogLevel.INFO, message, context)
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log(LogLevel.WARN, message, context)
  }

  error(message: string, context?: Record<string, unknown>) {
    this.log(LogLevel.ERROR, message, context)
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ) {
    if (level < this.level) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      context,
    }

    this.logToConsole(entry)
    this.logToFile(entry)
  }

  private logToConsole(entry: LogEntry) {
    const colors = {
      DEBUG: '\x1b[36m',
      INFO: '\x1b[32m',
      WARN: '\x1b[33m',
      ERROR: '\x1b[31m',
    }
    const reset = '\x1b[0m'

    const color = colors[entry.level as keyof typeof colors]
    const time = entry.timestamp.split('T')[1].split('.')[0]

    const contextStr = entry.context ? ' ' + JSON.stringify(entry.context) : ''
    console.log(
      `${color}[${time}] ${entry.level}${reset} ${entry.message}${contextStr}`
    )
  }

  private logToFile(entry: LogEntry) {
    if (!this.stream) {
      this.stream = createWriteStream(this.logFile, { flags: 'a' })
    }
    this.stream.write(JSON.stringify(entry) + '\n')
  }

  private parseLevel(level: string): LogLevel {
    const parsed = LogLevel[level.toUpperCase() as keyof typeof LogLevel]
    return parsed !== undefined ? parsed : LogLevel.INFO
  }

  private ensureLogDir() {
    const dir = dirname(this.logFile)
    mkdirSync(dir, { recursive: true })
  }

  async close() {
    if (this.stream) {
      await new Promise(resolve => this.stream!.end(resolve))
    }
  }
}

let logger: Logger | null = null

export function initLogger(config: { level: string; file: string }): Logger {
  logger = new Logger(config)
  return logger
}

export function getLogger(): Logger {
  if (!logger) {
    // Fall back to a default logger so modules that log can be used outside
    // the worker server (e.g. one-off scripts) without explicit init.
    logger = new Logger({
      level: process.env.LOG_LEVEL || 'info',
      file:
        process.env.LOG_FILE ||
        `${process.env.WORKER_DATA_DIR || '.'}/agent.log`,
    })
  }
  return logger
}
