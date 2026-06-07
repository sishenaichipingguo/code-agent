#!/usr/bin/env bun
// 测试记忆系统集成

import { spawn } from 'child_process'

console.log('🧪 Testing Memory System Integration\n')

// 测试 1: 正常模式（无记忆）
console.log('Test 1: Normal mode (no memory)')
console.log('Command: bun run dev "echo test"')
console.log('Expected: CLI runs normally, no Worker started\n')

// 测试 2: 记忆模式
console.log('Test 2: Memory mode')
console.log('Command: bun run dev --with-memory "echo test"')
console.log('Expected: Worker starts automatically, hooks injected\n')

// 测试 3: 帮助信息
console.log('Test 3: Help message')
const help = spawn('bun', ['run', 'dev', '--help'], { stdio: 'inherit' })

help.on('exit', () => {
  console.log('\n✅ All tests described. Run them manually to verify.')
})
