# Reddit

<p align="right">
  <b>English</b> · <a href="reddit.zh-CN.md">简体中文</a>
</p>

> Reddit rewards authenticity and punishes anything that smells like an ad.
> Post as yourself, tell a real story, and read each subreddit's self-promo
> rules first (most allow it if you're an active participant, not a drive-by).
> Reply to every comment in the first few hours.

---

## r/LocalLLaMA  (best fit — they care about local + privacy)

**Title:**
`I built a terminal coding agent with persistent memory — local embeddings, your data never leaves the machine`

**Body:**

I've been frustrated that every terminal coding agent forgets everything between sessions. I kept re-explaining my stack, my conventions, my style on every run. So I built Code Agent around memory as a first-class feature, and I built it local-first because this community's priorities are mine too.

How it works:

- Memory is stored as plain Markdown files in your repo (`.claude/memory/`), grouped into user / project / feedback / reference. Inspectable, editable, version-controllable — no black box.
- An LLM pass auto-extracts durable facts after a conversation ("uses pnpm", "API lives in src/api", "prefers named exports"), or you can just tell it to remember something.
- Optional semantic search: a background Worker embeds your history **locally** with all-MiniLM-L6-v2 (384-dim) via transformers.js, stored in SQLite + ChromaDB. No embedding API calls, nothing phoned home.
- Runs against **local models through Ollama** (or Anthropic Claude if you want a frontier model). MCP supported.

The whole point: route what you can to local models, keep your code and your memory on your own disk, and stop re-onboarding your agent every morning.

It's MIT, TypeScript on Bun, ships as a standalone binary. Early (v0.1) and I'd love feedback — especially on the memory model and how it holds up with local models that have smaller context windows.

Repo + one-line install: https://github.com/sishenaichipingguo/code-agent

(Honest caveat: Ollama models don't support tool calling, so with them it currently runs chat-only. Tool use needs a provider that supports it.)

---

## r/programming  (broader; lead with the problem, less local-model emphasis)

**Title:**
`Show r/programming: a terminal coding agent that remembers your project conventions across sessions`

**Body:**

Same opening problem (agents forget between runs), then the same four bullets as above but drop the heavy local-model framing and emphasize the plain-file, git-friendly memory model and the developer workflow. End with the repo link and an ask for feedback on the memory design.

> Tip: r/programming is stricter about self-promo. Only post if you can frame
> it as "here's an approach to a problem + here's what I learned", not "check
> out my project". Consider posting a short writeup/blog and linking the repo
> from it rather than linking the repo directly.

---

## Other subreddits worth a (careful) post

- r/commandline — terminal-tool audience, loves a good TUI
- r/ArtificialIntelligence / r/AI_Agents — agent-curious crowd
- r/ChatGPTCoding — practical AI-coding users

> Don't blast all of them the same day. Space them out over a week, tailor the
> title to each sub, and never copy-paste identical bodies (Reddit's spam filter
> flags that).
