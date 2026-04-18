import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'

export interface WorkerManagerOptions {
  port?: number
  dataDir?: string
  apiKey: string
  verbose?: boolean
  onReady?: () => void
  onError?: (error: Error) => void
}

export class WorkerManager {
  private workerProcess: ChildProcess | null = null
  private isReady = false
  private port: number
  private verbose: boolean

  constructor(private options: WorkerManagerOptions) {
    this.port = options.port || 37777
    this.verbose = options.verbose || false
  }

  async start(): Promise<void> {
    if (this.workerProcess) {
      throw new Error('Worker already running')
    }

    return new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        WORKER_PORT: String(this.port),
        ANTHROPIC_API_KEY: this.options.apiKey
      }

      if (this.options.dataDir) {
        env.WORKER_DATA_DIR = this.options.dataDir
      }

      // Start Worker subprocess
      // Use absolute path from project root to avoid path resolution issues
      const workerPath = join(process.cwd(), 'src/worker/server.ts')
      this.workerProcess = spawn('bun', ['run', workerPath], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false // Child process exits when parent exits
      })

      // Capture stdout
      this.workerProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString()

        // Detect successful startup
        if (output.includes('Worker Service running')) {
          this.isReady = true
          // Always show startup success message (even in non-verbose mode)
          process.stderr.write(`✅ Memory system ready (recording to ~/.claude-mem/)\n`)
          this.options.onReady?.()
          resolve()
        }

        // If verbose mode, output detailed logs
        if (this.verbose) {
          process.stderr.write(`[Worker] ${output}`)
        }
      })

      // Capture stderr
      this.workerProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString()
        if (this.verbose) {
          process.stderr.write(`[Worker Error] ${output}`)
        }
      })

      // Handle process errors
      this.workerProcess.on('error', (error) => {
        this.options.onError?.(error)
        reject(error)
      })

      // Handle process exit
      this.workerProcess.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
          const error = new Error(`Worker exited with code ${code}`)
          this.options.onError?.(error)
          if (!this.isReady) {
            reject(error)
          }
        }
        this.workerProcess = null
        this.isReady = false
      })

      // Timeout detection (10 seconds)
      setTimeout(() => {
        if (!this.isReady) {
          this.stop()
          reject(new Error('Worker startup timeout (10s)'))
        }
      }, 10000)
    })
  }

  stop(): void {
    if (this.workerProcess) {
      this.workerProcess.kill('SIGTERM')

      // 如果 3 秒后还没退出，强制杀死
      setTimeout(() => {
        if (this.workerProcess) {
          this.workerProcess.kill('SIGKILL')
        }
      }, 3000)

      this.workerProcess = null
      this.isReady = false
    }
  }

  getPort(): number {
    return this.port
  }

  isRunning(): boolean {
    return this.isReady && this.workerProcess !== null
  }

  async waitForHealth(maxRetries = 10, delayMs = 500): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`http://localhost:${this.port}/health`)
        if (response.ok) {
          return true
        }
      } catch {
        // 忽略错误，继续重试
      }
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
    return false
  }
}
