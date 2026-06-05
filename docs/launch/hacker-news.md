# Hacker News — Show HN

<p align="right">
  <b>English</b> · <a href="hacker-news.zh-CN.md">简体中文</a>
</p>

> How to use this file: pick the title, paste the body as the first comment
> right after you submit (HN lets you add a top comment to give context).
> Submit Tue–Thu, 8–10am US Pacific. Then stay in the thread and answer
> questions for the first 1–2 hours — early engagement is what drives ranking.

---

## Title options (keep it factual, no hype — HN punishes marketing language)

1. `Show HN: Code Agent – a terminal coding agent that remembers across sessions`
2. `Show HN: A terminal coding agent with persistent, local memory`
3. `Show HN: I gave my terminal coding agent long-term memory`

> Recommended: #1. "remembers across sessions" is concrete and sparks the
> "wait, the others don't?" reaction.

---

## First comment (context)

I built Code Agent, an open-source coding agent that runs in your terminal. It does the usual things — reads your codebase, edits files, runs commands — but the reason I built it is memory.

Every terminal agent I tried starts from zero on each run. I kept re-explaining the same things: which package manager we use, where the API layer lives, that I prefer named exports, that PR descriptions should lead with the "why". It felt like onboarding a new contractor every single morning.

So memory is the core feature here, and I tried to keep it boring and inspectable rather than magic:

- Facts are stored as plain Markdown files under `.claude/memory/`, grouped into user / project / feedback / reference. You can read them, edit them, diff them, and commit them. No opaque vector blob you can't inspect.
- After a conversation, an LLM pass extracts the durable facts worth keeping and skips anything already saved, so you don't have to manage memory by hand. You can also just say "remember that we deploy with Docker Compose" and it writes an entry.
- There's an optional Worker service for semantic search over longer history. It embeds locally with all-MiniLM-L6-v2 (384-dim) via transformers.js and stores vectors in SQLite + ChromaDB. Nothing leaves your machine except calls to whatever model provider you configure.
- Works with Anthropic Claude out of the box and local models via Ollama. MCP supported.

Stack: TypeScript on Bun. Ships as a standalone binary (one-line install script, no Node/Bun needed) or build from source. MIT licensed.

Repo: https://github.com/sishenaichipingguo/code-agent

This is early (v0.1). The Markdown memory + auto-extraction works today; the semantic-search Worker is wired up but I'd call it experimental. I'd genuinely like feedback on the memory model — whether plain files are the right primitive, how you'd want to scope/expire memories, and where this breaks down on bigger codebases. Happy to answer anything.

---

## Notes for replying in-thread

- If someone says "X already does this": acknowledge it, then be specific about
  the difference (plain-file, inspectable memory + local embeddings). Don't be
  defensive.
- If asked about privacy: lean in. Embeddings are local; memory is just files
  in their repo.
- If asked "why not just use a CLAUDE.md / rules file": good question — explain
  that auto-extraction + per-type structure + semantic recall is the step beyond
  a single static file.
- Don't ask for stars. Ever. HN hates it.
