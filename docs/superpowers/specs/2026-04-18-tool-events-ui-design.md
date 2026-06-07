# Tool Events UI Design

Date: 2026-04-18

## Problem

Tool execution output is written directly to `process.stderr`, which bypasses Ink's render layer and gets injected into the terminal mid-UI. This causes visual corruption: tool result blocks appear between Ink-rendered messages with no styling control.

## Goal

Route tool execution events through the existing `onMessage` chunk stream into React state, render them via a new `ToolActivity` Ink component, and clear them when the assistant reply arrives.

## Decisions

- Detail level: tool name + status + result summary (truncated to 60 chars)
- Persistence: tool events disappear when the first `text` chunk of the assistant reply arrives

---

## Architecture

### New Chunk Types

Two new chunk types are added to the `onMessage` async generator protocol:

```ts
{ type: 'tool_start'; name: string; input: string }
{ type: 'tool_end';   name: string; duration: number; result: string }
```

The caller (agent logic) yields these before and after each tool call. No other changes to the channel contract.

### State in App.tsx

```ts
interface ToolEvent {
  name: string
  status: 'running' | 'done' | 'error'
  duration?: number
  summary?: string   // result.slice(0, 60)
}

const [toolEvents, setToolEvents] = useState<ToolEvent[]>([])
```

Chunk handling in `handleSubmit`:

```ts
if (chunk.type === 'tool_start') {
  setToolEvents(prev => [...prev, { name: chunk.name, status: 'running' }])
}
if (chunk.type === 'tool_end') {
  setToolEvents(prev => prev.map(e =>
    e.name === chunk.name && e.status === 'running'
      ? { ...e, status: 'done', duration: chunk.duration, summary: chunk.result.slice(0, 60) }
      : e
  ))
}
if (chunk.type === 'text' && chunk.content) {
  setToolEvents([])  // clear on first text chunk
  // ...existing text accumulation logic
}
```

Note: matching by `name` assumes tools don't run in parallel. If parallel tool calls are needed later, add an `id` field to both chunk types.

### New Component: ToolActivity

Placed between `MessageList` and `InputBox` in `App.tsx`. Only renders when `toolEvents.length > 0`.

```
App
├── Header
├── MessageList
├── ToolActivity        ← new, ephemeral
└── InputBox
└── StatusBar
```

Each event renders as one line:

```
│  ⟳ bash          (running)
│  ✓ bash  · 3ms  → setup.sh .agent.yml.example LICENSE...
│  ✗ read  · 12ms → Error: file not found
```

- `running`: dim spinner char `⟳`, tool name, no result
- `done`: green `✓`, name, duration in ms, `→` result summary
- `error`: red `✗`, name, duration, `→` error summary

### Removing stderr Output

All `process.stderr.write` calls in the agent/tool execution path that produce the current `┌─ tool`, `│  ✓ Completed`, `│  Result:` blocks are removed or replaced with `logger.debug`. The UI is now the sole output channel for tool activity.

---

## Files Changed

| File | Change |
|------|--------|
| `src/ui/App.tsx` | add `toolEvents` state, extend chunk handling, render `ToolActivity` |
| `src/ui/components/ToolActivity.tsx` | new component |
| Agent/tool execution path | remove `process.stderr.write` tool output blocks |

---

## Out of Scope

- Parallel tool call support (no `id` field needed yet)
- Persisting tool events in message history
- Expandable/collapsible result detail
