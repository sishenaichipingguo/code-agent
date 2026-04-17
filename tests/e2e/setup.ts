import { spawn } from 'child_process'
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '../..')

export interface TestContext {
  workDir: string
  cleanup: () => Promise<void>
}

export async function createTestContext(): Promise<TestContext> {
  const workDir = await mkdtemp(join(tmpdir(), 'agent-e2e-'))

  return {
    workDir,
    cleanup: async () => {
      await rm(workDir, { recursive: true, force: true })
    }
  }
}

export interface AgentResult {
  stdout: string
  stderr: string
  exitCode: number | null
  duration: number
}

export async function runAgent(
  args: string[],
  options: {
    cwd?: string
    timeout?: number
    env?: Record<string, string>
  } = {}
): Promise<AgentResult> {
  const startTime = Date.now()
  const timeout = options.timeout || 30000
  const cliPath = join(PROJECT_ROOT, 'src/cli/index.ts')

  return new Promise((resolve, reject) => {
    const proc = spawn('bun', ['run', cliPath, ...args], {
      cwd: options.cwd || PROJECT_ROOT,
      env: {
        ...process.env,
        ...options.env,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-key'
      }
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGTERM')
      setTimeout(() => proc.kill('SIGKILL'), 50000)
    }, timeout)

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      const duration = Date.now() - startTime

      if (timedOut) {
        reject(new Error(`Agent process timed out after ${timeout}ms`))
      } else {
        resolve({
          stdout,
          stderr,
          exitCode: code,
          duration
        })
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

export async function writeTestFile(dir: string, filename: string, content: string): Promise<string> {
  const filepath = join(dir, filename)
  await writeFile(filepath, content, 'utf-8')
  return filepath
}

export async function readTestFile(dir: string, filename: string): Promise<string> {
  const filepath = join(dir, filename)
  return await readFile(filepath, 'utf-8')
}

export async function fileExists(dir: string, filename: string): Promise<boolean> {
  try {
    await readTestFile(dir, filename)
    return true
  } catch {
    return false
  }
}

export async function createTestConfig(dir: string, config: any): Promise<string> {
  const configPath = join(dir, '.agent.yml')
  const yaml = Object.entries(config)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n')
  await writeFile(configPath, yaml, 'utf-8')
  return configPath
}
