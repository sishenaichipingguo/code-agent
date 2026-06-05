# Launch kit

<p align="right">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a>
</p>

Ready-to-post copy and a sequencing plan for getting Code Agent in front of people.

Star count is mostly a function of **how many people see the repo**, not how good
the README is. These files are the "get people here" half.

## Files

- [`hacker-news.md`](./hacker-news.md) — Show HN title + first comment (highest-leverage single post)
- [`reddit.md`](./reddit.md) — r/LocalLLaMA, r/programming, and others
- [`twitter-and-chinese.md`](./twitter-and-chinese.md) — X thread + V2EX/即刻/B站/掘金
- [`blog-post.md`](./blog-post.md) — long-form technical post on the memory system

## Pre-launch checklist

Do these **before** you post anywhere:

- [ ] Replace the simulated `assets/demo.gif` with a real 20–30s screen recording
      (the "Monday teach it → Thursday it remembers" flow). Real recordings convert
      far better and survive scrutiny.
- [ ] Push a `v0.1.0` tag so the Releases page has real binaries the install
      script can fetch. Test `curl ... | bash` on a clean machine.
- [ ] Make sure the repo has: a clear description, topics/tags (ai, agent, cli,
      memory, llm, ollama), and the README renders correctly on GitHub.
- [ ] Add a star-history badge once you have some traction (star-history.com).
- [ ] Have answers ready for the obvious questions: "how is this different from
      X", "what about privacy", "why not just a rules file".

## Sequencing (don't blast everything on day one)

**Week 1 — single big push**
- Pick ONE primary channel. Recommended: **Hacker News (Show HN)**.
- Post Tue–Thu, 8–10am US Pacific (≈ 11pm–1am Beijing).
- Stay in the thread for the first 1–2 hours answering everything.

**Week 1, day 2–3 — second channel**
- **r/LocalLLaMA** (your local-first story is a perfect fit there).
- Tailor the title/body; never copy-paste identical text across platforms.

**Week 1, end — amplify**
- Post the **X/Twitter thread** with the demo video.
- Reply to your HN/Reddit threads with any updates ("fixed based on feedback").

**Week 2+ — sustain**
- Publish the **technical blog post** (dev.to + 掘金), link the repo from it.
- Post to Chinese communities (V2EX, 即刻, B站).
- Submit PRs to relevant awesome-lists (awesome-ai-agents, awesome-claude, etc.).
- Ship a visible feature, then post a "what's new" update. Repeat.

## Hard rules

- **Never buy stars or ask friends to mass-star.** GitHub detects it, the curve
  looks fake, and it violates ToS. A spiky-then-flat fake curve actively repels
  real users.
- **Never ask for stars on HN.** It's an instant credibility hit there.
- **Lead with the problem and the story, not the feature list.** "I was tired of
  re-explaining my project every morning" beats "supports 10 tools".
- **Reply to everyone early.** The first 2 hours of engagement decide ranking on
  every one of these platforms.
