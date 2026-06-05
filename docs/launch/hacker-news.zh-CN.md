# Hacker News —— Show HN

<p align="right">
  <a href="hacker-news.md">English</a> · <b>简体中文</b>
</p>

> 怎么用这份文件：HN 是英文社区，**实际发帖请用英文版**（hacker-news.md）。
> 这份中文版是给你理解内容、方便你自己调整用的。
> 选好标题后提交，紧接着把正文作为第一条评论贴上去（HN 允许你给自己的帖子加一条
> 顶部评论来补充背景）。发布时间选周二到周四美西上午 8–10 点。发完后头 1–2 小时
> 守在帖子里回答问题——早期互动决定排名。

---

## 标题候选（保持陈述、不要营销腔——HN 会惩罚营销语言）

1. `Show HN: Code Agent – a terminal coding agent that remembers across sessions`
   （Code Agent —— 一个能跨会话记忆的终端编程助手）
2. `Show HN: A terminal coding agent with persistent, local memory`
   （一个带持久化本地记忆的终端编程助手）
3. `Show HN: I gave my terminal coding agent long-term memory`
   （我给我的终端编程助手装了长期记忆）

> 推荐第 1 个。"remembers across sessions"（跨会话记忆）很具体，能激发
> 「等等，别的不会记吗？」这种反应。

---

## 第一条评论（背景）

中文意思（实际发帖请用英文版那段）：

我做了 Code Agent，一个开源的、跑在终端里的编程助手。它能做常规的事——读代码库、
改文件、执行命令——但我做它的真正原因是记忆。

我试过的每一个终端助手，每次运行都从零开始。我得一遍遍重复同样的事：我们用哪个
包管理器、API 层在哪、我偏好具名导出、PR 描述要先写「为什么」。感觉就像每天早上
都在重新培训一个新来的外包。

所以记忆是这个项目的核心功能，而且我尽量把它做得朴素、可检查，而不是搞得很玄：

- 事实以纯 Markdown 文件存在 `.claude/memory/`，分成 user / project / feedback /
  reference 四类。你能读、能改、能 diff、能提交。不是一坨你看不懂的向量。
- 对话结束后，一次 LLM 处理会提取值得长期保留的事实，并跳过已经存过的，这样你
  不用手动管理记忆。你也可以直接说「记住我们用 Docker Compose 部署」，它就写一条。
- 有一个可选的 Worker 服务，用于对更长历史做语义检索。它在本地用 all-MiniLM-L6-v2
  （384 维，通过 transformers.js）生成 embedding，存进 SQLite + ChromaDB。除了你
  自己配置的模型服务商之外，没有任何数据离开你的机器。
- 开箱即用 Anthropic Claude，也支持通过 Ollama 用本地模型。支持 MCP。

技术栈：TypeScript + Bun。提供独立二进制（一行命令安装脚本，不需要 Node/Bun），
也可从源码构建。MIT 协议。

仓库：https://github.com/sishenaichipingguo/code-agent

这还很早期（v0.1）。Markdown 记忆 + 自动提取现在能用；语义检索的 Worker 已经接上
但我会称它为实验性。我真心想听听对记忆模型的反馈——纯文件是不是对的原语、你会
希望怎么给记忆划定范围/设置过期、以及它在更大的代码库上会在哪里出问题。任何问题
都欢迎。

---

## 在帖子里回复时的注意事项

- 如果有人说「X 已经能做这个了」：先承认，然后具体说清差异（纯文件、可检查的记忆
  + 本地 embedding）。别防御。
- 被问到隐私：顺势强调。embedding 在本地、记忆就是他们仓库里的文件。
- 被问「为什么不直接用 CLAUDE.md / 规则文件」：好问题——解释自动提取 + 按类型
  结构化 + 语义回忆，是比单个静态文件更进一步的东西。
- 永远不要求 star。HN 极其反感这个。
