// 简单的 Worker Service 启动脚本
// 用于测试和开发

import { spawn } from 'child_process'
import { join } from 'path'
import { homedir } from 'os'

const WORKER_PORT = process.env.WORKER_PORT || '37777'
const DATA_DIR = process.env.WORKER_DATA_DIR || join(homedir(), '.claude-mem')
const API_KEY = process.env.ANTHROPIC_API_KEY

if (!API_KEY) {
  console.error('❌ Error: ANTHROPIC_API_KEY environment variable is required')
  console.error('   Set it with: export ANTHROPIC_API_KEY="your-key-here"')
  process.exit(1)
}

console.log('🚀 Starting Worker Service...')
console.log(`   Port: ${WORKER_PORT}`)
console.log(`   Data: ${DATA_DIR}`)
console.log(`   API Key: ${API_KEY.slice(0, 10)}...`)

const worker = spawn('bun', ['run', 'src/worker/server.ts'], {
  env: {
    ...process.env,
    WORKER_PORT,
    WORKER_DATA_DIR: DATA_DIR,
    ANTHROPIC_API_KEY: API_KEY
  },
  stdio: 'inherit'
})

worker.on('error', (err) => {
  console.error('❌ Worker failed to start:', err)
  process.exit(1)
})

worker.on('exit', (code) => {
  if (code !== 0) {
    console.error(`❌ Worker exited with code ${code}`)
    process.exit(code || 1)
  }
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n⏹️  Stopping Worker Service...')
  worker.kill('SIGINT')
})

process.on('SIGTERM', () => {
  console.log('\n⏹️  Stopping Worker Service...')
  worker.kill('SIGTERM')
})
