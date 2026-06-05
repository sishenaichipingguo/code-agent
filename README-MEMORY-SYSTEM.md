# Memory System Integration

<p align="right">
  <b>English</b> · <a href="README-MEMORY-SYSTEM.zh-CN.md">简体中文</a>
</p>

The complete architecture of Code Agent's memory system — a non-invasive design where an independent Worker Service handles observation generation, storage, and semantic search.

## Overview

This system layers persistent, searchable memory onto the Code Agent CLI without touching its core execution path. A separate Worker process receives hook calls over HTTP, generates structured observations, stores them, and exposes a search API. The CLI keeps working exactly as before whether or not the Worker is running.

## Architecture Components

### 1. Hook System Extension

**File**: `src/core/hooks/types.ts`

Two hook events were added:
- `user-prompt-submit`: fires when the user submits a prompt
- `post-tool-use`: fires after a tool finishes executing

### 2. AgentLoop Integration

**File**: `src/core/agent/loop.ts`

Hooks fire at key points:
- `user-prompt-submit` at the start of the `run()` method
- `post-tool-use` after `executeTools()` succeeds

### 3. Worker Service

**Core files**:
- `src/worker/server.ts` — Express HTTP server
- `src/worker/session/manager.ts` — session and queue management
- `src/worker/agents/observer.ts` — observer SDKAgent
- `src/worker/db/sqlite.ts` — SQLite data layer
- `src/worker/types/index.ts` — type definitions and interface contracts

**Responsibilities**:
- Receive hook calls from the CLI (HTTP API)
- Manage the `ActiveSession` and its message queue
- Use an SDKAgent to generate structured observations
- Persist to SQLite
- Provide a search API

### 4. Data Model

**SQLite tables**:
- `sessions` — session metadata
- `observations` — observation records (tool calls, file operations, etc.)
- `summaries` — session summaries
- `user_prompts` — user input history

## Usage

### Start the Worker Service

```bash
# Set your API key
export ANTHROPIC_API_KEY="your-key-here"

# Start the Worker
bun run dev:worker

# Or use the start script
bun run scripts/start-worker.ts
```

### Configure Hooks

Add to `.agent/config.json`:

```json
{
  "hooks": {
    "user-prompt-submit": [
      {
        "command": "curl -X POST http://localhost:37777/api/sessions/init -H 'Content-Type: application/json' -d '{\"contentSessionId\":\"$SESSION_ID\",\"project\":\"$(basename $PWD)\",\"prompt\":\"$USER_PROMPT\",\"platformSource\":\"claude-code\"}' 2>/dev/null || true",
        "onError": "ignore",
        "timeout": 5000
      }
    ],
    "post-tool-use": [
      {
        "command": "curl -X POST http://localhost:37777/api/sessions/observations -H 'Content-Type: application/json' -d '{\"contentSessionId\":\"$SESSION_ID\",\"toolName\":\"$TOOL_NAME\",\"toolInput\":$TOOL_INPUT,\"toolResponse\":\"$TOOL_RESULT\"}' 2>/dev/null || true",
        "onError": "ignore",
        "timeout": 3000
      }
    ]
  }
}
```

### Test

```bash
# Health check
curl http://localhost:37777/health

# Search observations
curl "http://localhost:37777/api/search?project=code-agent&limit=10"
```

## Data Flow

```
User input: "help me refactor auth.ts"
    ↓
AgentLoop.run() fires user-prompt-submit hook
    ↓
curl POST /api/sessions/init
    ↓
Worker: SessionManager.initSession()
    ↓
Worker: create Session → enqueue the init message
    ↓
Worker: SDKAgent.processInit() generates the initial observation
    ↓
Worker: persist to the SQLite observations table
    ↓
AgentLoop executes the tool Read(auth.ts)
    ↓
executeTools() fires post-tool-use hook
    ↓
curl POST /api/sessions/observations
    ↓
Worker: enqueue the observation message
    ↓
Worker: SDKAgent.processContinuation() analyzes the tool call
    ↓
Worker: persist to SQLite
```

## Implemented

- ✅ Hook system extension (`user-prompt-submit`, `post-tool-use`)
- ✅ AgentLoop integration points
- ✅ Worker Service HTTP server
- ✅ SessionManager (session management and message queue)
- ✅ SDKAgent (observer agent)
- ✅ SQLite data layer (`sessions` / `observations` / `summaries` / `user_prompts`)
- ✅ Search API (SQLite-backed)
- ✅ Type definitions and interface contracts

## Roadmap

### Phase 2: Semantic Search
- [ ] ChromaDB integration
- [ ] Vectorize observations
- [ ] Semantic similarity search
- [ ] Semantic injection into the SystemPromptBuilder

### Phase 3: Full Experience
- [ ] Viewer UI (React SPA or Ink TUI)
- [ ] SSE live updates
- [ ] Search and management interface
- [ ] Performance tuning and error handling

> **Note:** A local embedding generator (`all-MiniLM-L6-v2` via `@xenova/transformers`) and ChromaDB client already exist under `src/worker/embedding/`. Semantic search is wired up but considered experimental until the injection pipeline above lands.

## Design Advantages

1. **Non-invasive** — the Worker is a separate process; it doesn't affect the existing CLI.
2. **Incremental** — capabilities can be added step by step (SQLite → ChromaDB → UI).
3. **Optional** — users choose whether to start the Worker.
4. **Compatible** — builds on the existing hook and memory systems.
5. **Decoupled** — the CLI and Worker communicate over an HTTP API.

## File Manifest

```
src/
├── core/
│   ├── hooks/
│   │   └── types.ts (modified — new event types)
│   └── agent/
│       └── loop.ts (modified — fires new hooks)
├── worker/ (new)
│   ├── server.ts
│   ├── types/
│   │   └── index.ts
│   ├── db/
│   │   └── sqlite.ts
│   ├── embedding/
│   │   ├── generator.ts
│   │   └── chroma.ts
│   ├── agents/
│   │   └── observer.ts
│   └── session/
│       └── manager.ts
scripts/
└── start-worker.ts (new)
docs/
└── worker-service-setup.md (new)
```

## Next Steps

1. Test the Worker Service basics
2. Verify hook firing and the data flow
3. Finish ChromaDB integration (Phase 2)
4. Add the semantic injection pipeline
5. Build the Viewer UI (Phase 3)
