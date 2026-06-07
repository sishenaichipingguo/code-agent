import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestContext, runAgent, writeTestFile, type TestContext } from './setup'

const hasValidApiKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'test-key'

describe('E2E: Performance', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  test('should start quickly (< 500ms)', async () => {
    const result = await runAgent(['--help'], { cwd: ctx.workDir })

    expect(result.duration).toBeLessThan(500)
  })

  test.skipIf(!hasValidApiKey)('should handle large files efficiently', async () => {
    const largeContent = 'x'.repeat(1024 * 1024)
    await writeTestFile(ctx.workDir, 'large.txt', largeContent)

    const result = await runAgent(
      ['Count lines in large.txt'],
      { cwd: ctx.workDir, timeout: 20000 }
    )

    expect(result.exitCode).toBe(0)
    expect(result.duration).toBeLessThan(20000)
  })

  test.skipIf(!hasValidApiKey)('should handle multiple files efficiently', async () => {
    for (let i = 0; i < 50; i++) {
      await writeTestFile(ctx.workDir, `file${i}.txt`, `Content ${i}`)
    }

    const result = await runAgent(
      ['List all .txt files'],
      { cwd: ctx.workDir, timeout: 150000 }
    )

    expect(result.exitCode).toBe(0)
    expect(result.duration).toBeLessThan(150000)
  })
})

describe('E2E: Stress Tests (requires API key)', () => {
  let ctx: TestContext

  beforeEach(async () => {
    if (!hasValidApiKey) {
      console.log('⚠️  Skipping API-dependent tests (no valid ANTHROPIC_API_KEY)')
    }
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  test.skipIf(!hasValidApiKey)('should handle concurrent operations', async () => {
    const promises = Array.from({ length: 5 }, (_, i) =>
      runAgent(
        [`Create file${i}.txt with content "Test ${i}"`],
        { cwd: ctx.workDir, timeout: 20000 }
      )
    )

    const results = await Promise.all(promises)

    results.forEach(result => {
      expect(result.exitCode).toBe(0)
    })
  })

  test('should handle timeout gracefully', async () => {
    await expect(
      runAgent(
        ['Sleep for 10 seconds'],
        { cwd: ctx.workDir, timeout: 1000 }
      )
    ).rejects.toThrow(/timed out/)
  })
})
