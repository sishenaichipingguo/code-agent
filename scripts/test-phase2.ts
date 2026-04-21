#!/usr/bin/env bun
// 端到端测试：验证 Phase 2 记忆回忆功能

import { spawn } from 'child_process'
import { join } from 'path'
import { homedir } from 'os'

const DATA_DIR = join(homedir(), '.claude-mem')
const WORKER_PORT = 37777

console.log('🧪 Phase 2 Memory Recall E2E Test\n')

// 测试 1：检查 Worker 是否能启动
async function testWorkerStartup() {
  console.log('📋 Test 1: Worker Startup')

  return new Promise((resolve, reject) => {
    const worker = spawn('bun', ['run', 'src/worker/server.ts'], {
      env: {
        ...process.env,
        WORKER_PORT: String(WORKER_PORT),
        WORKER_DATA_DIR: DATA_DIR
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let output = ''
    const timeout = setTimeout(() => {
      worker.kill()
      reject(new Error('Worker startup timeout'))
    }, 30000) // 30 秒超时（首次需要下载模型）

    worker.stdout?.on('data', (data) => {
      output += data.toString()
      if (output.includes('Worker Service running')) {
        clearTimeout(timeout)
        console.log('✅ Worker started successfully\n')
        worker.kill()
        resolve(true)
      }
    })

    worker.stderr?.on('data', (data) => {
      const msg = data.toString()
      if (msg.includes('Error') || msg.includes('Failed')) {
        clearTimeout(timeout)
        worker.kill()
        reject(new Error(`Worker error: ${msg}`))
      }
    })

    worker.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

// 测试 2：检查 Recall API
async function testRecallAPI() {
  console.log('📋 Test 2: Recall API')

  // 启动 Worker
  const worker = spawn('bun', ['run', 'src/worker/server.ts'], {
    env: {
      ...process.env,
      WORKER_PORT: String(WORKER_PORT),
      WORKER_DATA_DIR: DATA_DIR
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  // 等待 Worker 启动
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.kill()
      reject(new Error('Worker startup timeout'))
    }, 30000)

    worker.stdout?.on('data', (data) => {
      if (data.toString().includes('Worker Service running')) {
        clearTimeout(timeout)
        resolve()
      }
    })
  })

  // 等待额外 2 秒确保 ChromaDB 初始化完成
  await new Promise(resolve => setTimeout(resolve, 2000))

  try {
    // 测试 health endpoint
    const healthRes = await fetch(`http://localhost:${WORKER_PORT}/health`)
    if (!healthRes.ok) {
      throw new Error('Health check failed')
    }
    console.log('✅ Health check passed')

    // 测试 recall endpoint
    const recallRes = await fetch(`http://localhost:${WORKER_PORT}/api/recall`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '创建文件',
        project: 'code-agent',
        limit: 5
      })
    })

    if (!recallRes.ok) {
      throw new Error(`Recall API failed: ${recallRes.statusText}`)
    }

    const data = await recallRes.json()
    console.log('✅ Recall API responded')
    console.log(`   Found ${data.count} memories`)

    if (data.count > 0) {
      console.log(`   Sample: ${data.memories[0].content.slice(0, 50)}...`)
    }

    console.log('')
  } finally {
    worker.kill()
  }
}

// 测试 3：检查迁移脚本
async function testMigration() {
  console.log('📋 Test 3: Migration Script')

  return new Promise((resolve, reject) => {
    const migrate = spawn('bun', ['run', 'scripts/migrate-to-chroma.ts'], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let output = ''
    const timeout = setTimeout(() => {
      migrate.kill()
      reject(new Error('Migration timeout'))
    }, 60000) // 60 秒超时

    migrate.stdout?.on('data', (data) => {
      output += data.toString()
    })

    migrate.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0 || output.includes('Migration complete')) {
        console.log('✅ Migration script works\n')
        resolve(true)
      } else {
        reject(new Error(`Migration failed with code ${code}`))
      }
    })

    migrate.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

// 运行所有测试
async function runTests() {
  try {
    console.log('⚠️  Note: First run may take 30-60 seconds to download embedding model\n')

    await testWorkerStartup()
    await testRecallAPI()
    await testMigration()

    console.log('✅ All tests passed!\n')
    console.log('📖 Next steps:')
    console.log('   1. Run: bun run memory:migrate (if you have existing data)')
    console.log('   2. Test: bun run dev --with-memory "创建一个 test.txt 文件"')
    console.log('   3. Test: bun run dev --with-memory "我刚才创建了什么文件？"')
    console.log('')
    console.log('📚 See docs/testing-phase2-recall.md for detailed testing guide')

    process.exit(0)
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message)
    process.exit(1)
  }
}

runTests()
