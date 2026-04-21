import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { createTestContext, runAgent, writeTestFile, readTestFile, type TestContext } from './setup'

const hasValidApiKey = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'test-key'

describe('E2E: Complete Workflows (requires API key)', () => {
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

  test.skipIf(!hasValidApiKey)('should complete multi-step task: create, edit, verify', async () => {
    const createResult = await runAgent(
      ['Create a file named workflow.txt with "Step 1"'],
      { cwd: ctx.workDir, timeout: 150000 }
    )
    expect(createResult.exitCode).toBe(0)

    let content = await readTestFile(ctx.workDir, 'workflow.txt')
    expect(content).toContain('Step 1')

    const editResult = await runAgent(
      ['Append "Step 2" to workflow.txt'],
      { cwd: ctx.workDir, timeout: 150000 }
    )
    expect(editResult.exitCode).toBe(0)

    content = await readTestFile(ctx.workDir, 'workflow.txt')
    expect(content).toContain('Step 1')
    expect(content).toContain('Step 2')
  })

  test.skipIf(!hasValidApiKey)('should handle code refactoring workflow', async () => {
    const initialCode = `
function add(a, b) {
  return a + b
}

function subtract(a, b) {
  return a - b
}
`
    await writeTestFile(ctx.workDir, 'math.js', initialCode)

    const result = await runAgent(
      ['Add JSDoc comments to all functions in math.js'],
      { cwd: ctx.workDir, timeout: 20000 }
    )

    const refactoredCode = await readTestFile(ctx.workDir, 'math.js')
    expect(refactoredCode).toContain('/**')
    expect(refactoredCode).toContain('*/')
    expect(refactoredCode).toContain('add')
    expect(refactoredCode).toContain('subtract')
  })

  test.skipIf(!hasValidApiKey)('should handle error recovery', async () => {
    const result = await runAgent(
      ['Read nonexistent.txt'],
      { cwd: ctx.workDir, timeout: 10000 }
    )

    expect(result.stdout.toLowerCase()).toMatch(/not found|does not exist|cannot find/)
  })
})

describe('E2E: Configuration and Modes (requires API key)', () => {
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

  test.skipIf(!hasValidApiKey)('should run in YOLO mode', async () => {
    const result = await runAgent(
      ['--mode', 'yolo', 'Create test.txt'],
      { cwd: ctx.workDir, timeout: 150000 }
    )

    expect(result.exitCode).toBe(0)
  })

  test.skipIf(!hasValidApiKey)('should respect custom config', async () => {
    await writeTestFile(ctx.workDir, '.agent.yml', `
mode: yolo
logging:
  level: debug
`)

    const result = await runAgent(
      ['Create configured.txt'],
      { cwd: ctx.workDir, timeout: 150000 }
    )

    expect(result.exitCode).toBe(0)
  })
})
