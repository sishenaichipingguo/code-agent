# Hooks System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shell-command hooks system to the agent so users can extend lifecycle events (session start/end, tool execution, compression, model sampling) without modifying source code.

**Architecture:** A `HookManager` class executes configured shell commands at named lifecycle points, passing context via environment variables. Notification hooks are fire-and-forget; transform hooks pass a JSON payload via stdin and read modified data from stdout. `HookManager` is injected into `AgentContext` as an optional field and called from `AgentLoop`, `ToolRegistry`, and `ContextManager`.

**Tech Stack:** TypeScript, Bun (subprocess via `Bun.spawn`), Zod (config validation), `.agent.yml`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/core/hooks/types.ts` | Create | `HookEvent` enum, `HookEntry`, `HooksConfig` types |
| `src/core/hooks/manager.ts` | Create | `HookManager` class — `fire()`, `transform()`, spawn logic |
| `src/core/hooks/manager.test.ts` | Create | Unit tests for `HookManager` |
| `src/core/config/schema.ts` | Modify | Add `hooks` field to `ConfigSchema` |
| `src/core/config/schema.test.ts` | Modify | Add tests for hooks config parsing |
| `src/core/agent/loop.ts` | Modify | Add `hooks?: HookManager` to `AgentContext`; fire session/sampling hooks |
| `src/core/tools/registry.ts` | Modify | Accept `hooks?` param in `execute()`; fire pre-tool / post-tool |
| `src/core/context/manager.ts` | Modify | Accept `hooks?` in constructor; fire pre-compress / post-compress |
| `src/cli/yolo.ts` | Modify | Initialize `HookManager` from config; pass to `AgentLoop` and `ContextManager` |
| `src/cli/safe.ts` | Modify | Initialize `HookManager` from config; pass to `AgentLoop` |

---

## Task 1: Define Hook Types

**Files:**
- Create: `src/core/hooks/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/core/hooks/types.ts

export type HookEvent =
  | 'session-start'
  | 'session-end'
  | 'pre-tool'
  | 'post-tool'
  | 'pre-compress'
  | 'post-compress'
  | 'post-sampling'

export type OnError = 'warn' | 'abort' | 'ignore'

export interface HookEntry {
  command: string
  onError: OnError
  timeout: number
}

export type HooksConfig = Partial<Record<HookEvent, HookEntry[]>>
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/hooks/types.ts
git commit -m "feat(hooks): add hook event types"
```

---

## Task 2: Add Hooks to Config Schema

**Files:**
- Modify: `src/core/config/schema.ts`
- Modify: `src/core/config/schema.test.ts`

- [ ] **Step 1: Write failing tests**

Open `src/core/config/schema.test.ts` and add at the end:

```typescript
describe('hooks config', () => {
  it('accepts a valid hooks section', () => {
    const result = ConfigSchema.parse({
      hooks: {
        'pre-tool': [{ command: 'echo hi', onError: 'abort', timeout: 3000 }],
        'session-end': [{ command: 'bash cleanup.sh' }]
      }
    })
    expect(result.hooks?.['pre-tool']?.[0].command).toBe('echo hi')
    expect(result.hooks?.['pre-tool']?.[0].onError).toBe('abort')
    expect(result.hooks?.['pre-tool']?.[0].timeout).toBe(3000)
  })

  it('applies defaults for onError and timeout', () => {
    const result = ConfigSchema.parse({
      hooks: { 'post-tool': [{ command: 'bash notify.sh' }] }
    })
    expect(result.hooks?.['post-tool']?.[0].onError).toBe('warn')
    expect(result.hooks?.['post-tool']?.[0].timeout).toBe(5000)
  })

  it('omits hooks when not configured', () => {
    const result = ConfigSchema.parse({})
    expect(result.hooks).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/core/config/schema.test.ts
```

Expected: FAIL — `hooks` not in schema.

- [ ] **Step 3: Add hooks to ConfigSchema**

In `src/core/config/schema.ts`, after the `memory` block (before the closing `)`):

```typescript
  hooks: z.record(
    z.enum([
      'session-start', 'session-end',
      'pre-tool', 'post-tool',
      'pre-compress', 'post-compress',
      'post-sampling'
    ]),
    z.array(z.object({
      command: z.string(),
      onError: z.enum(['warn', 'abort', 'ignore']).default('warn'),
      timeout: z.number().default(5000)
    }))
  ).optional(),
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/core/config/schema.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/config/schema.ts src/core/config/schema.test.ts
git commit -m "feat(hooks): add hooks section to config schema"
```

---

## Task 3: Implement HookManager

**Files:**
- Create: `src/core/hooks/manager.ts`
- Create: `src/core/hooks/manager.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/core/hooks/manager.test.ts`:

```typescript
import { describe, it, expect, mock } from 'bun:test'
import { HookManager } from './manager'
import type { HooksConfig } from './types'

describe('HookManager', () => {
  describe('fire()', () => {
    it('runs command and resolves on success', async () => {
      const config: HooksConfig = {
        'session-start': [{ command: 'true', onError: 'warn', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      await expect(mgr.fire('session-start', {})).resolves.toBeUndefined()
    })

    it('warns and continues when onError is warn and command fails', async () => {
      const warnings: string[] = []
      const config: HooksConfig = {
        'session-end': [{ command: 'false', onError: 'warn', timeout: 3000 }]
      }
      const mgr = new HookManager(config, (msg) => warnings.push(msg))
      await expect(mgr.fire('session-end', {})).resolves.toBeUndefined()
      expect(warnings.length).toBeGreaterThan(0)
    })

    it('throws when onError is abort and command fails', async () => {
      const config: HooksConfig = {
        'pre-tool': [{ command: 'false', onError: 'abort', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      await expect(mgr.fire('pre-tool', { AGENT_TOOL_NAME: 'bash' })).rejects.toThrow()
    })

    it('silently ignores failure when onError is ignore', async () => {
      const warnings: string[] = []
      const config: HooksConfig = {
        'post-tool': [{ command: 'false', onError: 'ignore', timeout: 3000 }]
      }
      const mgr = new HookManager(config, (msg) => warnings.push(msg))
      await expect(mgr.fire('post-tool', {})).resolves.toBeUndefined()
      expect(warnings.length).toBe(0)
    })

    it('does nothing when event has no hooks configured', async () => {
      const config: HooksConfig = {}
      const mgr = new HookManager(config)
      await expect(mgr.fire('session-start', {})).resolves.toBeUndefined()
    })

    it('passes environment variables to the command', async () => {
      const config: HooksConfig = {
        'post-tool': [{ command: 'bash -c "test \"$AGENT_TOOL_NAME\" = mybash"', onError: 'abort', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      await expect(mgr.fire('post-tool', { AGENT_TOOL_NAME: 'mybash' })).resolves.toBeUndefined()
    })
  })

  describe('transform()', () => {
    it('returns original payload when stdout is empty', async () => {
      const config: HooksConfig = {
        'pre-compress': [{ command: 'true', onError: 'warn', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      const payload = { messages: [{ role: 'user', content: 'hi' }] }
      const result = await mgr.transform('pre-compress', payload, {})
      expect(result).toEqual(payload)
    })

    it('returns modified payload from stdout JSON', async () => {
      const modified = { messages: [{ role: 'user', content: 'modified' }] }
      const json = JSON.stringify(modified)
      const config: HooksConfig = {
        'pre-compress': [{ command: `bash -c "echo '${json}'"`, onError: 'warn', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      const payload = { messages: [{ role: 'user', content: 'original' }] }
      const result = await mgr.transform('pre-compress', payload, {})
      expect(result).toEqual(modified)
    })

    it('returns original payload when stdout is not valid JSON', async () => {
      const config: HooksConfig = {
        'post-sampling': [{ command: 'bash -c "echo not-json"', onError: 'warn', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      const payload = { text: 'hello' }
      const result = await mgr.transform('post-sampling', payload, {})
      expect(result).toEqual(payload)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test src/core/hooks/manager.test.ts
```

Expected: FAIL — `HookManager` not defined.

- [ ] **Step 3: Implement HookManager**

Create `src/core/hooks/manager.ts`:

```typescript
import type { HookEvent, HookEntry, HooksConfig, OnError } from './types'

export class HookManager {
  constructor(
    private config: HooksConfig,
    private onWarn: (msg: string) => void = (msg) => process.stderr.write(`⚠️  Hook warning: ${msg}\n`)
  ) {}

  async fire(event: HookEvent, env: Record<string, string>): Promise<void> {
    const entries = this.config[event]
    if (!entries?.length) return
    for (const entry of entries) {
      await this.run(entry, env, null)
    }
  }

  async transform<T>(event: HookEvent, payload: T, env: Record<string, string>): Promise<T> {
    const entries = this.config[event]
    if (!entries?.length) return payload
    let current = payload
    for (const entry of entries) {
      const stdout = await this.run(entry, env, JSON.stringify(current))
      if (!stdout?.trim()) continue
      try {
        current = JSON.parse(stdout.trim())
      } catch {
        this.onWarn(`Hook for ${event} returned non-JSON stdout — ignoring`)
      }
    }
    return current
  }

  private async run(entry: HookEntry, extraEnv: Record<string, string>, stdin: string | null): Promise<string | null> {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      AGENT_CWD: process.cwd(),
      ...extraEnv
    }

    const stdinValue = stdin !== null ? Buffer.from(stdin) : undefined

    const proc = Bun.spawn(['bash', '-c', entry.command], {
      env,
      stdin: stdinValue ?? 'ignore',
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const timeoutHandle = setTimeout(() => {
      try { proc.kill() } catch { /* already exited */ }
    }, entry.timeout)

    let stdout = ''
    let exitCode: number | null = null

    try {
      stdout = await new Response(proc.stdout).text()
      exitCode = await proc.exited
    } finally {
      clearTimeout(timeoutHandle)
    }

    if (exitCode !== 0) {
      const errText = await new Response(proc.stderr).text()
      await this.handleError(entry.onError, entry.command, exitCode, errText.trim())
    }

    return stdout
  }

  private async handleError(onError: OnError, command: string, code: number | null, stderr: string): Promise<void> {
    const msg = `Hook command failed (exit ${code}): ${command}${stderr ? ` — ${stderr}` : ''}`
    if (onError === 'ignore') return
    if (onError === 'warn') {
      this.onWarn(msg)
      return
    }
    throw new Error(msg)
  }
}

export function createHookManager(config: HooksConfig | undefined): HookManager | undefined {
  if (!config || Object.keys(config).length === 0) return undefined
  return new HookManager(config)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test src/core/hooks/manager.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/hooks/types.ts src/core/hooks/manager.ts src/core/hooks/manager.test.ts
git commit -m "feat(hooks): implement HookManager with fire and transform"
```

---

## Task 4: Wire Hooks into AgentLoop (Session + Sampling)

**Files:**
- Modify: `src/core/agent/loop.ts`

- [ ] **Step 1: Add `hooks` to `AgentContext` and fire session-start / session-end**

In `src/core/agent/loop.ts`, make these changes:

**Add import at top:**
```typescript
import type { HookManager } from '@/core/hooks/manager'
```

**Add `hooks` field to `AgentContext` interface:**
```typescript
export interface AgentContext {
  model: ModelAdapter
  tools: ToolRegistry
  permissionContext: PermissionContext
  logger: Logger
  streaming?: boolean
  contextManager?: ContextManager
  systemPrompt?: string
  initialMessages?: Array<{ role: 'user' | 'assistant'; content: any }>
  sessionManager?: SessionManager
  hooks?: HookManager                     // ← add this line
}
```

**Wrap the body of `run()` to fire session hooks.** Replace the existing `run()` method body from the `this._messages = ...` line through the final `return finalText` with:

```typescript
async run(userMessage: string): Promise<string> {
  const metrics = getMetrics()
  const hookEnv = { AGENT_CWD: process.cwd() }

  await this.context.hooks?.fire('session-start', hookEnv)

  this._messages = [...(this.context.initialMessages ?? [])]
  const messages = this._messages

  const userMsg: Message = { role: 'user', content: userMessage }
  messages.push(userMsg)
  await this.saveMessage('user', userMessage)

  this.context.logger.info('Agent loop started', { message: userMessage })
  let finalText = ''

  try {
    while (true) {
      const request = {
        model: this.context.model.name,
        messages,
        stream: !!this.context.streaming,
        system: this.context.systemPrompt
      }

      if (this.context.streaming && this.context.model.chatStream) {
        const result = await this.runWithStream(request, messages)
        if (result.done) {
          finalText = result.text
          break
        }
        await this.maybeCompress(messages, result.inputTokens)
      } else {
        const response = this.context.contextManager
          ? await this.context.contextManager.ptlRetry(messages as any, () =>
              metrics.measure('api-call', () => this.context.model.chat(request, this.context.tools))
            )
          : await metrics.measure('api-call', () => this.context.model.chat(request, this.context.tools))

        await this.maybeCompress(messages, response.inputTokens)

        if (response.type === 'text') {
          let text = response.content ?? ''
          const transformed = await this.context.hooks?.transform('post-sampling', { text }, hookEnv)
          if (transformed) text = transformed.text

          process.stderr.write('\n' + text + '\n')
          finalText = text
          const assistantContent = response.rawContent ?? [{ type: 'text', text: finalText }]
          messages.push({ role: 'assistant', content: assistantContent })
          await this.saveMessage('assistant', assistantContent)
          break
        }

        if (response.type === 'tool_use') {
          const results = await this.executeTools(response.tools ?? [])

          const assistantContent = response.rawContent ?? response.tools
          messages.push({ role: 'assistant', content: assistantContent })
          await this.saveMessage('assistant', assistantContent)

          const toolResults = results.map(r => ({
            type: 'tool_result',
            tool_use_id: r.id,
            content: typeof r.result === 'string' ? r.result : JSON.stringify(r.result)
          }))
          messages.push({ role: 'user', content: toolResults })
          await this.saveMessage('user', toolResults)
          continue
        }

        if (response.type === 'error') {
          process.stderr.write('Error: ' + response.error + '\n')
          break
        }
      }
    }
  } catch (error: any) {
    this.context.logger.error('Agent loop failed', { error: error.message })
    throw error
  } finally {
    await this.context.hooks?.fire('session-end', hookEnv)
  }

  return finalText
}
```

- [ ] **Step 2: Apply post-sampling to the streaming path**

In the `runWithStream()` method, find the pure-text-response block near the end (after `if (!hasTools...)`):

```typescript
// Pure text response — save assistant message
if (fullText) {
  messages.push({ role: 'assistant', content: [{ type: 'text', text: fullText }] })
  await this.saveMessage('assistant', [{ type: 'text', text: fullText }])
}
return { done: true, text: fullText, inputTokens }
```

Replace with:

```typescript
// Pure text response — apply post-sampling hook, then save
if (fullText) {
  const hookEnv = { AGENT_CWD: process.cwd() }
  const transformed = await this.context.hooks?.transform('post-sampling', { text: fullText }, hookEnv)
  if (transformed?.text) fullText = transformed.text

  messages.push({ role: 'assistant', content: [{ type: 'text', text: fullText }] })
  await this.saveMessage('assistant', [{ type: 'text', text: fullText }])
}
return { done: true, text: fullText, inputTokens }
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/agent/loop.ts
git commit -m "feat(hooks): fire session-start/end and post-sampling hooks in AgentLoop"
```

---

## Task 5: Wire Hooks into ToolRegistry (pre-tool / post-tool)

**Files:**
- Modify: `src/core/tools/registry.ts`

- [ ] **Step 1: Add `hooks` field to `ToolRegistry` and fire pre-tool / post-tool**

In `src/core/tools/registry.ts`:

**Add import at top:**
```typescript
import type { HookManager } from '@/core/hooks/manager'
```

**Add `hooks` property to `ToolRegistry` class (after `private tools`)**:
```typescript
export class ToolRegistry {
  private tools = new Map<string, Tool>()
  hooks?: HookManager                        // ← add this line
```

**In `execute()`, wrap the tool call with hooks.** Replace the block from `try {` (after the permission check and logger import) through `}` (the outer catch) with:

```typescript
const { getLogger } = await import('@/infra/logger')
const { getConfig } = await import('@/core/config/loader')
const { executeWithTimeout } = await import('@/infra/timeout')

const logger = getLogger()
const config = getConfig()
const timeout = config.tools?.[name as keyof typeof config.tools]?.timeout || 30000
const hookEnv = { AGENT_TOOL_NAME: name, AGENT_TOOL_INPUT: JSON.stringify(input) }

try {
  logger.info('Tool execution started', { tool: name })

  // pre-tool: transform hook — may modify input; abort on onError: abort
  let effectiveInput = input
  if (this.hooks) {
    const transformed = await this.hooks.transform('pre-tool', { name, input }, hookEnv)
    effectiveInput = transformed.input
  }

  const result = await executeWithTimeout(
    tool.execute(effectiveInput),
    timeout,
    new AgentError(ErrorCode.TIMEOUT, `Tool "${name}" timed out after ${timeout}ms`)
  )
  logger.info('Tool execution completed', { tool: name })

  // post-tool: notify hook
  await this.hooks?.fire('post-tool', {
    ...hookEnv,
    AGENT_TOOL_RESULT: typeof result === 'string' ? result : JSON.stringify(result)
  })

  return result
} catch (error: any) {
  logger.error('Tool execution failed', { tool: name, error: error.message })
  if (error instanceof AgentError) throw error
  throw new AgentError(
    ErrorCode.TOOL_EXECUTION_FAILED,
    error.message, { tool: name, input }, false
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
bun test src/core/tools/registry.test.ts
```

Expected: all existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/tools/registry.ts
git commit -m "feat(hooks): fire pre-tool/post-tool hooks in ToolRegistry"
```

---

## Task 6: Wire Hooks into ContextManager (pre-compress / post-compress)

**Files:**
- Modify: `src/core/context/manager.ts`

- [ ] **Step 1: Add `hooks` to `ContextManager` constructor and fire compress hooks**

In `src/core/context/manager.ts`:

**Add import at top:**
```typescript
import type { HookManager } from '@/core/hooks/manager'
```

**Update constructor signature:**
```typescript
constructor(
  private model: ModelAdapter,
  private modelName: string,
  private hooks?: HookManager
) {}
```

**Replace the `compress()` method:**
```typescript
async compress(messages: RawMessage[], strategy: CompressionStrategy = 'auto'): Promise<RawMessage[]> {
  const hookEnv = { AGENT_COMPRESS_STRATEGY: strategy }

  // pre-compress: transform — hook may modify messages before summarisation
  let effectiveMessages = messages
  if (this.hooks) {
    const transformed = await this.hooks.transform('pre-compress', { messages }, hookEnv)
    effectiveMessages = transformed.messages
  }

  const compressor = this.compressors[strategy]
  const result = await compressor.run(effectiveMessages, this.model, this.modelName)
  const compressed = [this.buildPostCompressMessage(result.summary, strategy), ...result.messages]

  // post-compress: notify
  await this.hooks?.fire('post-compress', {
    ...hookEnv,
    AGENT_COMPRESS_ORIGINAL_COUNT: String(messages.length),
    AGENT_COMPRESS_RESULT_COUNT: String(compressed.length)
  })

  return compressed
}
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run context manager tests**

```bash
bun test src/core/context/manager.test.ts
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/core/context/manager.ts
git commit -m "feat(hooks): fire pre-compress/post-compress hooks in ContextManager"
```

---

## Task 7: Initialize HookManager in CLI Entry Points

**Files:**
- Modify: `src/cli/yolo.ts`
- Modify: `src/cli/safe.ts`

- [ ] **Step 1: Update `yolo.ts` to initialize hooks**

In `src/cli/yolo.ts`:

**Add import** (after existing imports):
```typescript
import { createHookManager } from '@/core/hooks/manager'
```

**After `const tools = await createToolRegistry()`, add:**
```typescript
const hookManager = createHookManager(config.hooks as any)
```

**Pass `hookManager` to `ContextManager`** — replace:
```typescript
const contextManager = new ContextManager(model, modelName)
```
with:
```typescript
const contextManager = new ContextManager(model, modelName, hookManager)
```

**Pass `hookManager` to `AgentLoop`** — in the `AgentLoop` constructor call, add:
```typescript
hooks: hookManager,
```

**Pass `hookManager` to `ToolRegistry`** — after the `AgentLoop` constructor call, add:
```typescript
tools.hooks = hookManager
```

- [ ] **Step 2: Update `safe.ts` to initialize hooks**

In `src/cli/safe.ts`:

**Add import** (after existing imports):
```typescript
import { createHookManager } from '@/core/hooks/manager'
```

**After `const tools = await createToolRegistry()`, add:**
```typescript
const hookManager = createHookManager(config.hooks as any)
```

**Pass `hookManager` to `AgentLoop`** — in the `AgentLoop` constructor call, add:
```typescript
hooks: hookManager,
```

**Pass `hookManager` to `ToolRegistry`** — after the `AgentLoop` constructor call, add:
```typescript
tools.hooks = hookManager
```

- [ ] **Step 3: Run typecheck**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
bun test
```

Expected: all existing tests PASS, all hook tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/yolo.ts src/cli/safe.ts
git commit -m "feat(hooks): initialize HookManager in CLI entry points"
```

---

## Task 8: Smoke Test End-to-End

**Files:**
- No source changes — verification only

- [ ] **Step 1: Create a test hook script**

```bash
cat > /tmp/test-hook.sh << 'EOF'
#!/usr/bin/env bash
echo "HOOK FIRED: event=$AGENT_EVENT tool=$AGENT_TOOL_NAME" >> /tmp/hook-log.txt
EOF
chmod +x /tmp/test-hook.sh
```

- [ ] **Step 2: Add hooks to `.agent.yml` temporarily**

Add to `.agent.yml`:
```yaml
hooks:
  session-start:
    - command: "bash -c \"echo session-start >> /tmp/hook-log.txt\""
  post-tool:
    - command: "/tmp/test-hook.sh"
  session-end:
    - command: "bash -c \"echo session-end >> /tmp/hook-log.txt\""
```

- [ ] **Step 3: Run the agent with a simple prompt**

```bash
rm -f /tmp/hook-log.txt
bun run dev "list files in current directory"
```

- [ ] **Step 4: Verify hook log**

```bash
cat /tmp/hook-log.txt
```

Expected output (order may vary):
```
session-start
HOOK FIRED: event= tool=ls
...
session-end
```

- [ ] **Step 5: Remove temporary hooks from `.agent.yml`**

Remove the `hooks:` block added in Step 2.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat(hooks): complete hooks system implementation"
```
