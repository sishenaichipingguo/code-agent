#!/usr/bin/env bun
// Test memory system cross-session recall

import { Database } from 'bun:sqlite'
import { join } from 'path'
import { homedir } from 'os'

const dbPath = join(homedir(), '.claude-mem', 'claude-mem.db')

console.log('🧪 Memory System Cross-Session Test\n')

try {
  const db = new Database(dbPath)

  // Get all sessions
  const sessions = db.prepare(`
    SELECT id, project, prompt_count, created_at
    FROM sessions
    ORDER BY created_at DESC
  `).all() as any[]

  if (sessions.length === 0) {
    console.log('❌ No sessions found. Run with --with-memory first.\n')
    process.exit(1)
  }

  console.log(`📊 Found ${sessions.length} session(s)\n`)

  // Show each session with its observations
  sessions.forEach((session, idx) => {
    const date = new Date(session.created_at).toLocaleString()
    console.log(`Session ${idx + 1}: ${session.project}`)
    console.log(`  Created: ${date}`)
    console.log(`  Prompts: ${session.prompt_count}`)

    // Get observations for this session
    const observations = db.prepare(`
      SELECT type, content, created_at
      FROM observations
      WHERE session_id = ?
      ORDER BY created_at ASC
    `).all(session.id) as any[]

    if (observations.length > 0) {
      console.log(`  Observations: ${observations.length}`)
      observations.forEach((obs, obsIdx) => {
        const obsDate = new Date(obs.created_at).toLocaleString()
        const preview = obs.content.slice(0, 80).replace(/\n/g, ' ')
        console.log(`    ${obsIdx + 1}. [${obs.type}] ${preview}...`)
      })
    } else {
      console.log(`  Observations: 0 (SDKAgent may have failed)`)
    }
    console.log()
  })

  // Test cross-session data
  console.log('🔗 Cross-Session Analysis:\n')

  const totalObs = db.prepare('SELECT COUNT(*) as count FROM observations').get() as any
  const totalPrompts = db.prepare('SELECT SUM(prompt_count) as total FROM sessions').get() as any

  console.log(`  Total prompts across all sessions: ${totalPrompts.total || 0}`)
  console.log(`  Total observations recorded: ${totalObs.count}`)

  if (sessions.length >= 2) {
    console.log(`\n✅ Multiple sessions detected!`)
    console.log(`   Session 1 and Session 2 are stored in the same database.`)
    console.log(`   This means they CAN share memory context.`)
  } else {
    console.log(`\n⚠️  Only 1 session found. Run another session to test cross-session memory.`)
  }

  db.close()

  console.log('\n💡 Next Steps:')
  console.log('   1. Run: bun run dev --with-memory "create a file called session1.txt"')
  console.log('   2. Exit and run: bun run dev --with-memory "what file did I create earlier?"')
  console.log('   3. Run this test again to see both sessions')

} catch (error: any) {
  if (error.message.includes('unable to open database')) {
    console.log('❌ Memory database not found.')
    console.log('\nTo create it:')
    console.log('  export ANTHROPIC_API_KEY="your-key"')
    console.log('  export WORKER_MODEL="claude-sonnet-4-6"')
    console.log('  bun run dev --with-memory "test message"')
  } else {
    console.error('Error:', error.message)
  }
}
