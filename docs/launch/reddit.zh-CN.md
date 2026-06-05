# Reddit

<p align="right">
  <a href="reddit.md">English</a> · <b>简体中文</b>
</p>

> Reddit 奖励真诚、惩罚任何带广告味的东西。**实际发帖请用英文版**（reddit.md），
> 这份中文版供你理解和调整。以你本人身份发帖，讲真实的故事，先读一遍每个 subreddit
> 的自我推广规则（大多数允许，前提是你是活跃用户，而不是发完就跑）。
> 头几个小时回复每一条评论。

---

## r/LocalLLaMA（最契合 —— 他们在意本地 + 隐私）

**标题：**
`I built a terminal coding agent with persistent memory — local embeddings, your data never leaves the machine`
（我做了个带持久记忆的终端编程助手 —— 本地 embedding，你的数据不出本机）

**正文（中文意思）：**

我一直被一件事烦到：每个终端编程助手都会在会话之间忘掉一切。我每次运行都要重新
解释我的技术栈、约定、风格。所以我做了 Code Agent，把记忆当成头等功能，并且做成
本地优先——因为这个社区在意的事，也正是我在意的。

它怎么工作：

- 记忆以纯 Markdown 文件存在你仓库里（`.claude/memory/`），分 user / project /
  feedback / reference 四类。可检查、可编辑、可纳入版本控制——不是黑盒。
- 对话后由一次 LLM 处理自动提取长期事实（「用 pnpm」「API 在 src/api」「偏好具名
  导出」），你也可以直接让它记住某事。
- 可选的语义检索：后台 Worker 用 all-MiniLM-L6-v2（384 维，通过 transformers.js）
  在**本地**生成 embedding，存进 SQLite + ChromaDB。没有 embedding 的 API 调用，
  什么都不往外发。
- 可以跑**通过 Ollama 的本地模型**（想用前沿模型的话也支持 Anthropic Claude）。
  支持 MCP。

整个出发点：能用本地模型的就用本地模型，把你的代码和记忆都留在自己的硬盘上，别再
每天早上重新培训你的 agent。

MIT 协议，TypeScript + Bun，提供独立二进制。还很早期（v0.1），很想听反馈——尤其是
记忆模型，以及它在上下文窗口更小的本地模型上的表现。

仓库 + 一行安装：https://github.com/sishenaichipingguo/code-agent

（如实说明：Ollama 模型不支持工具调用，所以用它们时目前是纯对话模式。工具调用需要
一个支持它的服务商。）

---

## r/programming（更宽泛；先讲问题，少强调本地模型）

**标题：**
`Show r/programming: a terminal coding agent that remembers your project conventions across sessions`
（一个能跨会话记住你项目约定的终端编程助手）

**正文：**

同样的开场问题（agent 在多次运行间会失忆），然后用上面那四个要点，但去掉重本地模型
的框架，强调纯文件、对 git 友好的记忆模型和开发者工作流。最后放仓库链接，并请大家
对记忆设计提反馈。

> 提示：r/programming 对自我推广更严格。只有当你能把它包装成「这是对某个问题的一种
> 解法 + 我学到了什么」而不是「来看我的项目」时才发。可以考虑先发一篇短文/博客，
> 从文章里链接仓库，而不是直接贴仓库链接。

---

## 其他值得（谨慎）发的 subreddit

- r/commandline —— 终端工具受众，喜欢好的 TUI
- r/ArtificialIntelligence / r/AI_Agents —— 对 agent 好奇的人群
- r/ChatGPTCoding —— 务实的 AI 编程用户

> 别同一天把所有 sub 都轰一遍。分散到一周里发，每个 sub 的标题都要量身定制，
> 绝不要复制粘贴完全相同的正文（Reddit 的垃圾过滤器会标记这种行为）。
