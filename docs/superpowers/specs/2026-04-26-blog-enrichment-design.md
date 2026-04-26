# Blog Series Enrichment Design

## Goal

Enrich the existing 8-part blog series under `docs/blog/` and add a 9th article on the Hooks system. Target audience: developers new to AI agents, but content should go deep — explaining *why* design decisions were made, not just *what* the code does.

## Problems with Current State

1. Code examples don't match actual source (e.g., `isReadOnly` vs `isConcurrencySafe`, function vs class for SystemPromptBuilder)
2. Concept sections describe *what* without explaining *why*
3. Exercises are trivial (change a number, add one line) — don't build real understanding
4. Several important mechanisms are completely missing: hooks, ptlRetry, MEMORY_NAMESPACE, SessionStore, TeamStore, SendMessageTool, streaming retry

## Per-Article Changes

### 01 — What is an Agent
- Add streaming vs non-streaming path explanation
- Explain all three loop exit conditions (text / tool_use / error)
- Show full AgentContext structure and what each field does
- Upgrade exercise: implement onChunk callback to print tool name + duration

### 02 — Tool Use
- Fix isReadOnly → isConcurrencySafe (code mismatch)
- Show full execution pipeline: permission check → pre-tool hook → timeout → post-tool hook
- Add MCP tool injection from createToolRegistry()
- Upgrade exercise: write a tool with a pre-tool hook

### 03 — Permissions
- Explain decide() three-way logic (allow/ask/deny)
- Explain preparePermissionMatcher (pre-approve a class of operations)
- Explain why promptUser() writes to stderr not stdout
- Add createRestricted() for sub-agent tool scoping

### 04 — System Prompt
- Fix: function → SystemPromptBuilder class
- Add SessionStore (previous session summary injection)
- Add TeamStore (shared team memory)
- Explain truncateMemoryIndex and why it's needed
- Explain --- section separator design

### 05 — Context Compression
- Add three compression strategies: auto / micro / manual
- Explain ptlRetry — automatic compress-and-retry on prompt-too-long errors
- Add pre/post compress hooks
- Upgrade exercise: manually trigger compact() and observe message count

### 06 — Memory System
- Add MEMORY_NAMESPACE env var (sub-agent memory isolation)
- Add SessionStore and TeamStore
- Explain two-phase design: index in system prompt + load file on demand

### 07 — Multi-Model
- Explain chatStream? optional method and graceful degradation
- Add Full Jitter exponential backoff retry in runWithStream
- Add OpenAI-compatible adapter extension path

### 08 — Sub-Agent
- Add SendMessageTool (message an already-running sub-agent)
- Explain stderr/stdout separation design
- Show createRestricted() usage for sub-agent tool scoping

### 09 — Hooks System (new)
- What hooks are: lifecycle extension points without modifying core
- Full event list with when each fires
- Two hook types: fire (notify) vs transform (modify data)
- Real use case: log all tool calls via post-tool-use hook
- Exercise: write a pre-tool hook that intercepts bash commands

## Constraints

- No "written by Claude" attribution in comments, docs, or commits
- Do not commit documentation files alongside code commits
- Keep Chinese as the primary language for all blog content
