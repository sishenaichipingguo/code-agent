#!/usr/bin/env bun
// Migrate existing observations from SQLite to ChromaDB

import { Database } from 'bun:sqlite'
import { join } from 'path'
import { homedir } from 'os'
import { ChromaManager } from '../src/worker/embedding/chroma'
import { initEmbeddingModel } from '../src/worker/embedding/generator'
import type { Observation } from '../src/worker/types'

const DATA_DIR = join(homedir(), '.claude-mem')
const dbPath = join(DATA_DIR, 'claude-mem.db')

async function migrate() {
  console.log('🔄 Starting migration to ChromaDB...\n')

  // Check if database exists
  try {
    const db = new Database(dbPath)

    // Get all observations
    const stmt = db.prepare(`
      SELECT id, session_id, type, content, metadata, created_at
      FROM observations
      ORDER BY created_at ASC
    `)

    const rows = stmt.all() as any[]
    console.log(`📊 Found ${rows.length} observations in SQLite\n`)

    if (rows.length === 0) {
      console.log('✅ No observations to migrate')
      db.close()
      return
    }

    // Initialize embedding model
    console.log('🔄 Loading embedding model...')
    await initEmbeddingModel()
    console.log('✅ Embedding model loaded\n')

    // Initialize ChromaDB
    console.log('🔄 Initializing ChromaDB...')
    const chroma = new ChromaManager(DATA_DIR)
    await chroma.init()
    console.log('✅ ChromaDB initialized\n')

    // Check existing count
    const stats = await chroma.getStats()
    console.log(`📊 ChromaDB currently has ${stats.count} observations\n`)

    if (stats.count > 0) {
      console.log('⚠️  ChromaDB already has data. This script will add new observations.')
      console.log('   If you want to start fresh, delete ~/.claude-mem/chroma/ first.\n')
    }

    // Convert rows to Observation objects
    const observations: Observation[] = rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      type: row.type,
      content: row.content,
      metadata: JSON.parse(row.metadata),
      createdAt: row.created_at
    }))

    // Batch migrate
    const batchSize = 10
    let migrated = 0

    for (let i = 0; i < observations.length; i += batchSize) {
      const batch = observations.slice(i, i + batchSize)

      console.log(`🔄 Migrating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(observations.length / batchSize)} (${batch.length} observations)...`)

      await chroma.addObservations(batch)
      migrated += batch.length

      console.log(`✅ Migrated ${migrated}/${observations.length} observations\n`)
    }

    // Verify
    const finalStats = await chroma.getStats()
    console.log(`\n✅ Migration complete!`)
    console.log(`   SQLite: ${rows.length} observations`)
    console.log(`   ChromaDB: ${finalStats.count} observations`)

    db.close()
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message)
    process.exit(1)
  }
}

migrate()
