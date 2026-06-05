# Blog post (long-form)

<p align="right">
  <b>English</b> · <a href="blog-post.zh-CN.md">简体中文</a>
</p>

> Publish on dev.to, your own blog, and 掘金 (translate). Link the repo from the
> post rather than making the post an ad for the repo. Technical depth is what
> earns long-tail traffic and credibility. Target ~1000–1500 words.

---

## Title options

- Why your AI coding agent should have long-term memory (and how I built one)
- I gave my terminal coding agent a memory. Here's what changed.
- Plain files beat vector databases: designing inspectable memory for a coding agent

---

## Draft

### The problem: my agent had amnesia

I use a terminal coding agent every day. It's great at the in-the-moment stuff —
reading files, editing code, running commands. But every new session started from
nothing. I'd re-explain the same facts on a loop:

- we use pnpm, not npm
- the API handlers live in `src/api`, one file per route
- I prefer named exports
- keep PR descriptions short, lead with the *why*

It felt like onboarding a brand-new contractor every single morning. The model
wasn't dumb — it just had no continuity. So I built memory into the agent and
tried to do it in a way I'd actually trust.

### Design goal: memory you can read

The easy version of "agent memory" is to throw everything into a vector database
and hope semantic search surfaces the right thing. I didn't want that as the
*primary* store, for one reason: I can't read it. When the agent does something
weird, I want to open a file and see exactly what it thinks it knows.

So the core store is plain Markdown files in the repo:

```
.claude/memory/
├── MEMORY.md              # human-readable index
├── user_indent-style.md   # "2-space indent, prefer named exports"
├── project_api-layout.md  # "REST handlers in src/api, one file per route"
└── feedback_pr-style.md   # "PR descriptions short, lead with the why"
```

Each entry is Markdown with a little frontmatter:

```markdown
---
name: indent-style
description: code formatting preferences
type: user
created: 2026-01-12T09:30:00Z
updated: 2026-01-12T09:30:00Z
---

Use 2-space indentation. Prefer named exports over default exports.
```

Four types, because not all memory is the same:

| Type | Captures |
|------|----------|
| `user` | personal preferences / working style |
| `project` | conventions and structure of this codebase |
| `feedback` | corrections you've given the agent |
| `reference` | docs, links, facts worth keeping |

Because it's just files in the repo, memory is inspectable, editable, diffable,
and version-controlled. Code review for your agent's brain. If a teammate clones
the repo, they get the project memory too.

### Making it effortless: auto-extraction

Memory you have to manage by hand is memory you won't use. So after a conversation,
an LLM pass reviews the transcript and extracts durable facts worth keeping —
skipping anything already in the index. The prompt is roughly: "return a JSON array
of memory entries worth saving across future sessions; skip what's already known;
return [] if nothing new."

You can also be explicit: *"remember that we deploy with Docker Compose"* writes an
entry immediately. Explicit when you care, automatic when you don't.

### When files aren't enough: local semantic search

Plain files are great for "what do you know about me / this project". They're not
great for "have we hit an error like this before" across hundreds of past sessions.
That's where semantic search earns its place — as a *complement*, not a replacement.

An optional background Worker:

1. captures observations (tool calls, file ops) via hooks
2. embeds them locally with `all-MiniLM-L6-v2` (384-dim) through transformers.js
3. stores vectors in SQLite + ChromaDB
4. exposes a similarity-search API

The key word is **local**. Embeddings are generated on your machine. No embedding
API, nothing phoned home. The only network calls are to whatever model provider
you choose — and if that's a local model via Ollama, nothing leaves at all.

The Worker is a separate process the CLI talks to over HTTP, so it's fully optional
and non-invasive: the agent works with or without it.

### What I learned

- **Inspectable beats clever.** Being able to `cat` a memory file and fix it by
  hand has saved me more times than any ranking algorithm.
- **Auto-extraction needs a skip list.** Without "skip what's already known", you
  drown in near-duplicate memories fast.
- **Local embeddings are good enough.** all-MiniLM-L6-v2 is tiny and the recall is
  plenty for "remind me what we decided about X".
- **Memory is a UX problem, not just storage.** The hard part isn't where to put
  facts — it's deciding what's worth keeping and surfacing it at the right moment.

### Try it

It's open source (MIT), TypeScript on Bun, with a one-line install:

```bash
curl -fsSL https://raw.githubusercontent.com/sishenaichipingguo/code-agent/main/install.sh | bash
```

Repo: https://github.com/sishenaichipingguo/code-agent

It's early (v0.1). The file-based memory and auto-extraction work today; the
semantic Worker is wired up but experimental. I'd love feedback on the memory
model — whether plain files are the right primitive, and how you'd want to scope
and expire memories over time.

---

## Honesty checklist before publishing

- [ ] Don't claim semantic search is production-ready — it's experimental. Say so.
- [ ] Don't overstate team memory if you haven't battle-tested it.
- [ ] The "what I learned" section should reflect things you actually observed.
      Reviewers smell invented lessons.
