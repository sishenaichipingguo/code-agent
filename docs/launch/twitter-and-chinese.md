# X/Twitter + Chinese communities

<p align="right">
  <b>English</b> · <a href="twitter-and-chinese.zh-CN.md">简体中文</a>
</p>

---

## X / Twitter

> A 20–30s screen recording (the "Monday teach it → Thursday it remembers"
> demo) outperforms any text. Attach the GIF/video to the first tweet.

**Tweet 1 (the hook + video):**

Every terminal coding agent forgets everything when you close it.

So you re-explain your stack, your style, your conventions. Every. Single. Time.

I built one that remembers. 🧵

[attach demo video]

**Tweet 2 (how):**

Memory is stored as plain Markdown in your repo — readable, editable, git-friendly. No black box.

It auto-extracts durable facts after each session ("uses pnpm", "prefers named exports") so you don't manage it by hand.

**Tweet 3 (local/privacy):**

Optional semantic search runs 100% locally — embeddings via transformers.js (all-MiniLM-L6-v2), stored in SQLite + ChromaDB.

Works with local models through Ollama, or Claude if you want a frontier model.

Nothing leaves your machine except your own model calls.

**Tweet 4 (CTA):**

Open source (MIT), TypeScript on Bun, one-line install.

It's early (v0.1) and I'd love your feedback on the memory model 👇
https://github.com/sishenaichipingguo/code-agent

> After posting, reply to your own thread with the repo link again (some people
> only see the first tweet). Engage with anyone who quote-tweets.

---

## 中文社区

### V2EX（「分享创造」节点）

**标题：** 我做了个会"记忆"的终端 AI 编程助手，跨会话记住你的项目约定（开源）

**正文：**

一直被一件事烦到：现有的终端 AI 编程助手，每次关掉再打开就把之前的全忘了。我得反复跟它说我们用什么包管理器、API 在哪个目录、我喜欢具名导出、PR 描述要先写为什么……每天像在重新培训一个新人。

所以我做了 Code Agent，把"记忆"当成核心功能，而且尽量做得透明、可控：

- 记忆以纯 Markdown 文件存在你仓库的 `.claude/memory/` 里，分 user/project/feedback/reference 四类。能读、能改、能 diff、能提交，不是看不见的黑盒。
- 对话结束后自动提取值得长期保留的事实，已有的会跳过；你也可以直接说"记住我们用 Docker Compose 部署"。
- 可选的语义检索完全跑在本地：用 transformers.js 的 all-MiniLM-L6-v2 生成 embedding，存进 SQLite + ChromaDB，数据不出本机。
- 支持本地模型（Ollama）和 Claude，支持 MCP。

技术栈 TypeScript + Bun，提供一行命令安装的独立二进制，MIT 协议。还很早期（v0.1），特别想听听大家对"记忆该怎么设计"的看法。

仓库：https://github.com/sishenaichipingguo/code-agent

### 即刻 / 小红书 / B站

- 即刻：发那条 20-30 秒的"周一教它、周四它还记得"短视频，配一句"AI 编程助手为什么不该有失忆症"。
- B站：可以做一个 2-3 分钟的演示视频，标题《我给 AI 编程助手装了"长期记忆"》。
- 掘金：发技术博客（见 docs/launch/blog-post.md），讲记忆系统怎么设计的，文末附仓库。

> 说实话：中文圈对 GitHub star 的转化低于英文圈，star 主战场还是 HN / Reddit。
> 中文渠道更适合做技术影响力和长尾流量，别指望单条爆量。
