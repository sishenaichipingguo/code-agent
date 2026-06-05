# Code Agent — the terminal coding agent that remembers

<p align="right">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="https://github.com/sishenaichipingguo/code-agent/stargazers"><img src="https://img.shields.io/github/stars/sishenaichipingguo/code-agent?style=flat&logo=github" alt="GitHub stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-000000?logo=bun" alt="Runtime: Bun" /></a>
  <img src="https://img.shields.io/badge/memory-persistent-8a2be2" alt="Persistent memory" />
</p>

**Most coding agents forget everything the moment you close them. Code Agent doesn't.** It builds persistent, searchable memory across sessions — your preferences, project conventions, and past decisions stay with the agent so you stop re-explaining yourself every time.

<!--
  This is a simulated demo rendered by scripts/make-demo-gif.py.
  Replace assets/demo.gif with a real screen recording when you have one.
-->
<p align="center">
  <img src="assets/demo.gif" alt="Code Agent demo — it remembers your preferences across sessions" width="90%" />
</p>

```bash
git clone https://github.com/sishenaichipingguo/code-agent && cd code-agent
bun install && export ANTHROPIC_API_KEY=sk-...
bun run dev "remember that I use 2-space indent and prefer named exports"
```

## Why Code Agent?

Every other terminal agent starts from zero on each run. You re-explain your stack, your style, your conventions — every single time. Code Agent treats memory as a first-class feature:

- 🧠 **Persistent cross-session memory** — facts are stored as plain Markdown under `.claude/memory/`, organized into `user`, `project`, `feedback`, and `reference` types. Human-readable, version-controllable, yours.
- ✨ **Automatic extraction** — after a conversation, an LLM pass pulls out the durable facts worth keeping ("uses pnpm", "API lives in `src/api`", "hates default exports") so you don't have to manage memory by hand.
- 🔎 **Local semantic search** — an optional Worker service embeds your history with a local `all-MiniLM-L6-v2` model (384-dim, no data leaves your machine) and stores it in SQLite + ChromaDB for similarity search over past work.
- 👥 **Team memory** — share a curated memory set across a team so conventions are consistent for everyone, not relearned per person.
- 🔒 **Private by design** — embeddings run locally; memory is just files in your repo. Nothing is sent anywhere except your own model provider.

> The result: by session three, the agent already knows how your project works.

## Everything else you'd expect

- 🛠️ **Built-in tools** — bash, read, write, edit, glob, grep, ls, cp, mv, rm
- 🤖 **Multi-model** — Anthropic Claude out of the box, local models via Ollama
- 🔌 **MCP support** — connect Model Context Protocol servers for extra tools/context
- 🎯 **YOLO & Safe modes** — skip prompts for speed, or require approval for risky ops
- 🌊 **Streaming responses** with live token + cost tracking
- 🎨 **Interactive UI** (Ink) with tab completion and keyboard shortcuts
- 📝 **Session management** — persistent history, `--continue` to pick up where you left off
- 🛑 **Graceful shutdown** and YAML-based configuration

## Quick Start

```bash
# 1. Clone and install (requires Bun: https://bun.sh)
git clone https://github.com/sishenaichipingguo/code-agent
cd code-agent
bun install

# 2. Set your API key
export ANTHROPIC_API_KEY=your_key_here

# 3. Run (YOLO mode is the default)
bun run dev "Create a hello.txt file"

# Safe mode requires approval for risky operations
bun run dev --mode safe "Refactor src/auth.ts"
```

## How memory works

Memory lives in your project as plain files, so it's transparent and reviewable:

```
.claude/memory/
├── MEMORY.md              # human-readable index, grouped by type
├── user_indent-style.md   # "uses 2-space indent, prefers named exports"
├── project_api-layout.md  # "REST handlers live in src/api, one file per route"
└── feedback_pr-style.md   # "keep PR descriptions short, lead with the why"
```

Each entry is Markdown with simple frontmatter (`name`, `description`, `type`, `created`, `updated`). The four types:

| Type | What it captures |
|------|------------------|
| `user` | Your personal preferences and working style |
| `project` | Conventions and structure of this codebase |
| `feedback` | Corrections you've given the agent |
| `reference` | Docs, links, and facts worth keeping around |

### Automatic vs. explicit

- **Explicit**: just tell it — *"remember that we deploy with Docker Compose"* — and it writes a memory entry.
- **Automatic**: `AutoExtractor` reviews finished conversations and saves new durable facts, skipping anything already in the index.

### Optional: semantic memory (Worker service)

For semantic search over a longer history, run the background Worker. It generates embeddings locally and stores them in SQLite + ChromaDB:

```bash
# Start the Worker (first run downloads the local embedding model)
export ANTHROPIC_API_KEY=your_key_here
bun run dev:worker

# Health check
curl http://localhost:37777/health
```

The Worker is **non-invasive** — a separate process the CLI talks to over HTTP, fully optional. See [README-MEMORY-SYSTEM.md](./README-MEMORY-SYSTEM.md) for the full architecture and data flow.

## Configuration

Create `.agent.yml` in your project:

```yaml
provider: anthropic
model: claude-sonnet-4-6
mode: yolo

tools:
  bash:
    timeout: 30000
  rm:
    confirm: true

session:
  autoSave: true
  saveDir: .agent/sessions

logging:
  level: info
  file: .agent/logs/agent.log
```

### Using local models via Ollama

```yaml
provider: ollama
baseUrl: http://localhost:11434
model: qwen2.5-coder:7b
mode: yolo
```

```bash
ollama serve
ollama pull qwen2.5-coder:7b
```

> **Note:** Ollama models don't support tool calling, so the agent runs in chat-only mode with them.

See `.agent.yml.example` for all configuration options.

## Usage

```bash
agent "your request here"            # CLI mode (simple output)
agent --ui "your request here"       # interactive UI (Ink)
agent --mode safe "your request"     # require approval for risky ops
agent --model claude-opus-4 "..."    # pick a model
agent --continue "follow up"         # continue the last session
```

### UI mode

- **Tab completion** for files, tools, and commands
- **Keyboard shortcuts** — Ctrl+C to exit, arrow keys for history
- **Live streaming** of responses
- **Status bar** with token usage and performance

## Build

```bash
bun run build           # JavaScript bundle
bun run build:binary    # native binary
```

## Architecture

- **CLI Layer** — argument parsing and mode detection
- **Agent Core** — main loop with tool execution
- **Memory System** — Markdown store, auto-extraction, team memory
- **Worker Service** — optional semantic memory (SQLite + ChromaDB + local embeddings)
- **Tools System** — extensible tool registry
- **Model Adapters** — unified interface across providers
- **Infrastructure** — logging, metrics, tracing

## License

MIT
