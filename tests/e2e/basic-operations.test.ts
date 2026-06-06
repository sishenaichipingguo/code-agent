import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  createTestContext,
  runAgent,
  writeTestFile,
  readTestFile,
  fileExists,
  type TestContext,
  shouldRunE2E,
} from './setup'

describe('E2E: Basic Operations', () => {
  let ctx: TestContext

  beforeEach(async () => {
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  test('should show help message', async () => {
    const result = await runAgent(['--help'], { cwd: ctx.workDir })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Usage')
  })

  test('should show version', async () => {
    const result = await runAgent(['--version'], { cwd: ctx.workDir })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toMatch(/\d+\.\d+\.\d+/)
  })

  test('should handle invalid arguments', async () => {
    const result = await runAgent(['--invalid-flag'], { cwd: ctx.workDir })

    expect(result.exitCode).not.toBe(0)
  })
})

describe('E2E: File Operations (requires API key)', () => {
  let ctx: TestContext

  beforeEach(async () => {
    if (!shouldRunE2E) {
      console.log(
        '⚠️  Skipping E2E API tests (set RUN_E2E=1 and a real ANTHROPIC_API_KEY to run)'
      )
    }
    ctx = await createTestContext()
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  test.skipIf(!shouldRunE2E)('should read existing file', async () => {
    await writeTestFile(ctx.workDir, 'test.txt', 'Hello World')

    const result = await runAgent(['Read test.txt'], {
      cwd: ctx.workDir,
      timeout: 10000,
    })

    expect(result.stdout).toContain('Hello World')
  })

  test.skipIf(!shouldRunE2E)('should create new file', async () => {
    await runAgent(
      ['Create a file named output.txt with content "Test Output"'],
      { cwd: ctx.workDir, timeout: 150000 }
    )

    const exists = await fileExists(ctx.workDir, 'output.txt')
    expect(exists).toBe(true)

    const content = await readTestFile(ctx.workDir, 'output.txt')
    expect(content).toContain('Test Output')
  })

  test.skipIf(!shouldRunE2E)('should edit existing file', async () => {
    await writeTestFile(ctx.workDir, 'edit-test.txt', 'Original Content')

    await runAgent(['Change "Original" to "Modified" in edit-test.txt'], {
      cwd: ctx.workDir,
      timeout: 150000,
    })

    const content = await readTestFile(ctx.workDir, 'edit-test.txt')
    expect(content).toContain('Modified Content')
    expect(content).not.toContain('Original Content')
  })
})

describe('E2E: Search Operations (requires API key)', () => {
  let ctx: TestContext

  beforeEach(async () => {
    if (!shouldRunE2E) {
      console.log(
        '⚠️  Skipping E2E API tests (set RUN_E2E=1 and a real ANTHROPIC_API_KEY to run)'
      )
    }
    ctx = await createTestContext()
    await writeTestFile(
      ctx.workDir,
      'file1.js',
      'function hello() { return "world" }'
    )
    await writeTestFile(
      ctx.workDir,
      'file2.js',
      'function goodbye() { return "world" }'
    )
    await writeTestFile(ctx.workDir, 'file3.txt', 'Some text content')
  })

  afterEach(async () => {
    await ctx.cleanup()
  })

  test.skipIf(!shouldRunE2E)('should find files by pattern', async () => {
    const result = await runAgent(['Find all .js files'], {
      cwd: ctx.workDir,
      timeout: 10000,
    })

    expect(result.stdout).toContain('file1.js')
    expect(result.stdout).toContain('file2.js')
    expect(result.stdout).not.toContain('file3.txt')
  })

  test.skipIf(!shouldRunE2E)('should search file content', async () => {
    const result = await runAgent(['Search for "hello" in all files'], {
      cwd: ctx.workDir,
      timeout: 10000,
    })

    expect(result.stdout).toContain('file1.js')
    expect(result.stdout).toContain('hello')
  })
})
