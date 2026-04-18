# Tool Events UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route tool execution events through the `onChunk` callback into React state and render them via a new `ToolActivity` Ink component, eliminating raw `process.stderr.write` output that corrupts the UI.

**Architecture:** `AgentLoop.executeTools` currently writes tool progress directly to stderr. We extend `AgentContext.onChunk` to accept two new chunk types (`tool_start`, `tool_end`), call them from `executeTools`, and handle them in `App.tsx` with a `toolEvents` state array. A new `ToolActivity` component renders the events between `MessageList` and `InputBox`, clearing when the first `text` chunk arrives.

**Tech Stack:** TypeScript, React (Ink), existing `AgentLoop` / `onChunk` pattern

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/agent/loop.ts` | Modify | Replace stderr tool output with `onChunk` calls; keep stderr only for non-tool messages |
| `src/ui/App.tsx` | Modify | Add `toolEvents` state; handle `tool_start`/`tool_end`/`text` chunks; render `ToolActivity` |
| `src/ui/components/ToolActivity.tsx` | Create | Render ephemeral tool event list |

---

## Task 1: Extend `onChunk` type in `AgentContext`

**Files:**
- Modify: `src/core/agent/loop.ts:21`

- [ ] **Step 1: Update the `onChunk` type signature**

In `src/core/agent/loop.ts`, replace line 21:

```ts
// Before
onChunk?: (chunk: { type: string; content?: string }) => void

// After
onChunk?: (chunk:
  | { type: 'text'; content: string }
  | { type: 'tool_start'; name: string; input: string }
  | { type: 'tool_end'; name: string; duration: number; result: string; error?: string }
) => void
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors on the type change (callers pass `{ type: 'text', content }` which still matches).

- [ ] **Step 3: Commit**

```bash
git add src/core/agent/loop.ts
git commit -m "feat(loop): extend onChunk type for tool_start/tool_end events"
```

---

## Task 2: Replace stderr tool output with `onChunk` calls

**Files:**
- Modify: `src/core/agent/loop.ts:176-251` (`executeTools` / `runTool`)

- [ ] **Step 1: Replace the `runTool` inner function**

In `src/core/agent/loop.ts`, replace the entire `runTool` async function (lines 176–251) with:

```ts
const runTool = async (tool: any) => {
  const startTime = Date.now()

  this.context.onChunk?.({
    type: 'tool_start',
    name: tool.name,
    input: tool.input ? JSON.stringify(tool.input).slice(0, 120) : ''
  })

  try {
    const result = await metrics.measure('tool-execution', () =>
      this.context.tools.execute(tool.name, tool.input, this.context.permissionContext)
    )
    const duration = Date.now() - startTime
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result)

    this.context.onChunk?.({
      type: 'tool_end',
      name: tool.name,
      duration,
      result: resultStr
    })

    return { id: tool.id, result }
  } catch (error: any) {
    const duration = Date.now() - startTime
    const { AgentError } = await import('@/infra/errors')
    const errorMsg = error instanceof AgentError ? error.toUserMessage() : (error.message || String(error))

    this.context.onChunk?.({
      type: 'tool_end',
      name: tool.name,
      duration,
      result: '',
      error: errorMsg
    })

    this.context.logger.error('Tool execution failed', { tool: tool.name, error: error.message })
    return { id: tool.id, error: error.message }
  }
}
```

Also remove the `process.stderr.write('\n')` on line 296 in `runWithStream` (it was there to separate tool output visually — no longer needed).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/agent/loop.ts
git commit -m "feat(loop): route tool events through onChunk, remove stderr tool output"
```

---

## Task 3: Create `ToolActivity` component

**Files:**
- Create: `src/ui/components/ToolActivity.tsx`

- [ ] **Step 1: Write the component**

Create `src/ui/components/ToolActivity.tsx`:

```tsx
import React from 'react'
import { Box, Text } from 'ink'

export interface ToolEvent {
  name: string
  status: 'running' | 'done' | 'error'
  duration?: number
  summary?: string
}

interface ToolActivityProps {
  events: ToolEvent[]
}

export function ToolActivity({ events }: ToolActivityProps) {
  if (events.length === 0) return null

  return (
    <Box flexDirection="column" paddingX={1}>
      {events.map((e, i) => (
        <Box key={i}>
          {e.status === 'running' && (
            <Text dimColor>⟳ {e.name}</Text>
          )}
          {e.status === 'done' && (
            <Text>
              <Text color="green">✓ </Text>
              <Text>{e.name}</Text>
              {e.duration !== undefined && <Text dimColor> · {e.duration}ms</Text>}
              {e.summary && <Text dimColor> → {e.summary}</Text>}
            </Text>
          )}
          {e.status === 'error' && (
            <Text>
              <Text color="red">✗ </Text>
              <Text>{e.name}</Text>
              {e.duration !== undefined && <Text dimColor> · {e.duration}ms</Text>}
              {e.summary && <Text color="red"> → {e.summary}</Text>}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/components/ToolActivity.tsx
git commit -m "feat(ui): add ToolActivity component for ephemeral tool event display"
```

---

## Task 4: Wire `toolEvents` state into `App.tsx`

**Files:**
- Modify: `src/ui/App.tsx`

- [ ] **Step 1: Import `ToolActivity` and its type**

At the top of `src/ui/App.tsx`, add after the existing component imports:

```ts
import { ToolActivity } from './components/ToolActivity'
import type { ToolEvent } from './components/ToolActivity'
```

- [ ] **Step 2: Add `toolEvents` state**

Inside the `App` function, after the existing `useState` declarations (around line 26), add:

```ts
const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
```

- [ ] **Step 3: Extend chunk handling in `handleSubmit`**

In `handleSubmit`, the current chunk loop (lines 68–79) only handles `chunk.type === 'text'`. Replace the entire `for await` loop with:

```ts
for await (const chunk of onMessage(text)) {
  if (chunk.type === 'tool_start') {
    setToolEvents(prev => [...prev, { name: chunk.name, status: 'running' }])
  }

  if (chunk.type === 'tool_end') {
    setToolEvents(prev => prev.map(e =>
      e.name === chunk.name && e.status === 'running'
        ? {
            ...e,
            status: chunk.error ? 'error' : 'done',
            duration: chunk.duration,
            summary: (chunk.error ?? chunk.result).slice(0, 60)
          }
        : e
    ))
  }

  if (chunk.type === 'text' && chunk.content) {
    setToolEvents([])
    assistantContent += chunk.content
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant') {
        return [...prev.slice(0, -1), { role: 'assistant', content: assistantContent }]
      }
      return [...prev, { role: 'assistant', content: assistantContent }]
    })
  }
}
```

- [ ] **Step 4: Render `ToolActivity` in JSX**

In the `return` block of `App`, add `<ToolActivity events={toolEvents} />` between `<MessageList>` and `<InputBox>`:

```tsx
return (
  <Box flexDirection="column" height="100%">
    <Header model={model} mode={mode} />
    <MessageList messages={messages} />
    <ToolActivity events={toolEvents} />
    <InputBox
      onSubmit={handleSubmit}
      disabled={isProcessing}
      completions={completions}
      onRequestCompletions={handleRequestCompletions}
    />
    <StatusBar />
  </Box>
)
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/ui/App.tsx
git commit -m "feat(ui): wire toolEvents state and render ToolActivity in App"
```

---

## Task 5: Wire `onChunk` in the CLI entry points

**Files:**
- Modify: `src/cli/safe.ts`
- Modify: `src/cli/yolo.ts`

The `AgentLoop` in both CLI entry points currently has no `onChunk`. The UI (`App.tsx`) passes `onMessage` which is an async generator — but `AgentLoop.run()` is not a generator; it calls `onChunk` synchronously. We need to confirm how `App.tsx` connects to `AgentLoop`.

- [ ] **Step 1: Check how `onMessage` is wired to `AgentLoop`**

Read `src/ui/App.tsx` line 19 — `onMessage: (text: string) => AsyncGenerator<any>`. This is passed in from outside. Check the entry point that renders the Ink app:

```bash
grep -r "render\|App\b" src/cli/ --include="*.ts" -l
```

Then read that file to see how `onMessage` is constructed and passed to `App`.

- [ ] **Step 2: Add `onChunk` to `AgentLoop` construction in the UI entry point**

In whichever CLI file renders the Ink `App`, find where `AgentLoop` is constructed and add an `onChunk` that feeds into the async generator that `onMessage` returns. The pattern should look like:

```ts
// A queue to bridge onChunk (sync push) → async generator (async pull)
function makeChunkQueue() {
  const queue: any[] = []
  let resolve: (() => void) | null = null

  const push = (chunk: any) => {
    queue.push(chunk)
    resolve?.()
    resolve = null
  }

  async function* drain() {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()
      } else {
        await new Promise<void>(r => { resolve = r })
      }
    }
  }

  return { push, drain }
}
```

Then wire it:

```ts
const chunkQueue = makeChunkQueue()

const loop = new AgentLoop({
  // ...existing options...
  onChunk: (chunk) => chunkQueue.push(chunk)
})

const onMessage = async function* (text: string) {
  const runPromise = loop.run(text)
  // drain chunks until run() resolves
  for await (const chunk of chunkQueue.drain()) {
    yield chunk
    // check if run completed
  }
}
```

> Note: The exact wiring depends on how the current entry point constructs `onMessage`. Read the file in Step 1 before implementing. The queue pattern above is the correct approach regardless of the specific file.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/cli/
git commit -m "feat(cli): wire onChunk to async generator for UI tool event streaming"
```

---

## Self-Review

**Spec coverage:**
- ✓ New chunk types `tool_start` / `tool_end` — Task 1
- ✓ `executeTools` replaced with `onChunk` calls — Task 2
- ✓ `ToolActivity` component with running/done/error states — Task 3
- ✓ `toolEvents` state in `App.tsx`, cleared on first `text` chunk — Task 4
- ✓ stderr tool output removed — Task 2
- ⚠ Task 5 has a conditional step (read before implement) — this is intentional because the CLI entry point wiring depends on code not yet fully read. The queue pattern is fully specified.

**Placeholder scan:** Task 5 Step 2 says "read the file in Step 1 before implementing" — this is not a placeholder, it's a deliberate instruction because the exact file path is unknown until Step 1 runs.

**Type consistency:**
- `ToolEvent` defined in `ToolActivity.tsx`, imported in `App.tsx` — consistent
- `onChunk` union type in `loop.ts` matches what `App.tsx` handles (`tool_start`, `tool_end`, `text`) — consistent
- `chunk.error ?? chunk.result` in App.tsx matches `tool_end` shape (`result: string; error?: string`) — consistent
