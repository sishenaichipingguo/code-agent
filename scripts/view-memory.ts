#!/usr/bin/env bun
// 查看记忆系统记录的数据

import { Database } from 'bun:sqlite'
import { join } from 'path'
import { homedir } from 'os'

const dbPath = join(homedir(), '.claude-mem', 'claude-mem.db')

try {
  const db = new Database(dbPath)

  console.log('📊 Memory System Statistics\n')

  // 统计会话数
  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any
  console.log(`Sessions: ${sessionCount.count}`)

  // 统计观察记录数
  const obsCount = db.prepare('SELECT COUNT(*) as count FROM observations').get() as any
  console.log(`Observations: ${obsCount.count}`)

  // 统计摘要数
  const summaryCount = db.prepare('SELECT COUNT(*) as count FROM summaries').get() as any
  console.log(`Summaries: ${summaryCount.count}`)

  // 最近的会话
  console.log('\n📝 Recent Sessions:\n')
  const recentSessions = db.prepare(`
    SELECT project, prompt_count, created_at
    FROM sessions
    ORDER BY created_at DESC
    LIMIT 5
  `).all() as any[]

  if (recentSessions.length === 0) {
    console.log('  No sessions recorded yet.')
  } else {
    recentSessions.forEach(s => {
      const date = new Date(s.created_at).toLocaleString()
      console.log(`  • ${s.project} (${s.prompt_count} prompts) - ${date}`)
    })
  }

  // 最近的观察记录
  console.log('\n🔍 Recent Observations:\n')
  const recentObs = db.prepare(`
    SELECT type, content, created_at
    FROM observations
    ORDER BY created_at DESC
    LIMIT 5
  `).all() as any[]

  if (recentObs.length === 0) {
    console.log('  No observations recorded yet.')
  } else {
    recentObs.forEach(o => {
      const date = new Date(o.created_at).toLocaleString()
      const preview = o.content.slice(0, 60).replace(/\n/g, ' ')
      console.log(`  • [${o.type}] ${preview}... - ${date}`)
    })
  }

  db.close()

  console.log('\n💡 Tip: Use --with-memory flag to enable recording')
  console.log('   Example: bun run dev --with-memory "your task"')

} catch (error: any) {
  if (error.message.includes('no such table')) {
    console.log('📭 No memory data found.')
    console.log('\nTo start recording:')
    console.log('  1. Set ANTHROPIC_API_KEY environment variable')
    console.log('  2. Run: bun run dev --with-memory "your task"')
  } else if (error.message.includes('unable to open database')) {
    console.log('📭 Memory database not found.')
    console.log('\nMemory system has not been used yet.')
    console.log('To start recording:')
    console.log('  bun run dev --with-memory "your task"')
  } else {
    console.error('Error:', error.message)
  }
}
