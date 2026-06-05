# X/Twitter + 中文社区

<p align="right">
  <a href="twitter-and-chinese.md">English</a> · <b>简体中文</b>
</p>

---

## X / Twitter

> 一段 20–30 秒的屏幕录制（「周一教它 → 周四它记得」那个 demo）比任何文字都管用。
> 把 GIF/视频附在第一条推文上。**实际发推请用英文版**（twitter-and-chinese.md），
> 这里是中文意思。

**推文 1（钩子 + 视频）：**

每个终端编程助手，一关掉就忘得一干二净。

于是你得反复解释你的技术栈、风格、约定。每。一。次。

我做了一个会记住的。🧵

[附 demo 视频]

**推文 2（怎么做的）：**

记忆以纯 Markdown 存在你的仓库里——可读、可改、对 git 友好。不是黑盒。

它在每次会话后自动提取长期事实（「用 pnpm」「偏好具名导出」），你不用手动管理。

**推文 3（本地/隐私）：**

可选的语义检索 100% 在本地运行——用 transformers.js（all-MiniLM-L6-v2）生成 embedding，
存进 SQLite + ChromaDB。

支持通过 Ollama 用本地模型，想用前沿模型也可以用 Claude。

除了你自己的模型调用，什么都不出本机。

**推文 4（行动号召）：**

开源（MIT），TypeScript + Bun，一行命令安装。

还很早期（v0.1），很想听听你对记忆模型的反馈 👇
https://github.com/sishenaichipingguo/code-agent

> 发完后，在自己的推文串下面再回复一次仓库链接（有些人只看到第一条）。
> 有人引用转发就去互动。

---

## 中文社区

### V2EX（「分享创造」节点）

**标题：** 我做了个会"记忆"的终端 AI 编程助手，跨会话记住你的项目约定（开源）

**正文：**

一直被一件事烦到：现有的终端 AI 编程助手，每次关掉再打开就把之前的全忘了。我得
反复跟它说我们用什么包管理器、API 在哪个目录、我喜欢具名导出、PR 描述要先写为
什么……每天像在重新培训一个新人。

所以我做了 Code Agent，把"记忆"当成核心功能，而且尽量做得透明、可控：

- 记忆以纯 Markdown 文件存在你仓库的 `.claude/memory/` 里，分 user/project/feedback/
  reference 四类。能读、能改、能 diff、能提交，不是看不见的黑盒。
- 对话结束后自动提取值得长期保留的事实，已有的会跳过；你也可以直接说"记住我们用
  Docker Compose 部署"。
- 可选的语义检索完全跑在本地：用 transformers.js 的 all-MiniLM-L6-v2 生成 embedding，
  存进 SQLite + ChromaDB，数据不出本机。
- 支持本地模型（Ollama）和 Claude，支持 MCP。

技术栈 TypeScript + Bun，提供一行命令安装的独立二进制，MIT 协议。还很早期（v0.1），
特别想听听大家对"记忆该怎么设计"的看法。

仓库：https://github.com/sishenaichipingguo/code-agent

### 即刻 / 小红书 / B站

- 即刻：发那条 20-30 秒的"周一教它、周四它还记得"短视频，配一句"AI 编程助手为什么
  不该有失忆症"。
- B站：可以做一个 2-3 分钟的演示视频，标题《我给 AI 编程助手装了"长期记忆"》。
- 掘金：发技术博客（见 blog-post.zh-CN.md），讲记忆系统怎么设计的，文末附仓库。

> 说实话：中文圈对 GitHub star 的转化低于英文圈，star 主战场还是 HN / Reddit。
> 中文渠道更适合做技术影响力和长尾流量，别指望单条爆量。
