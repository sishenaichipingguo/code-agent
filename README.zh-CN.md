# Code Agent —— 会记忆的终端编程助手

<p align="right">
  <a href="README.md">English</a> · <b>简体中文</b> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a>
</p>

<p align="center">
  <a href="https://github.com/sishenaichipingguo/code-agent/stargazers"><img src="https://img.shields.io/github/stars/sishenaichipingguo/code-agent?style=flat&logo=github" alt="GitHub stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-000000?logo=bun" alt="Runtime: Bun" /></a>
  <img src="https://img.shields.io/badge/memory-persistent-8a2be2" alt="持久记忆" />
</p>

**大多数编程助手一关闭就忘得一干二净，Code Agent 不会。** 它会在多次会话之间建立持久、可检索的记忆——你的偏好、项目约定、过往决策都会留在助手身上，让你不必每次都重新解释一遍。

<!--
  这是由 scripts/make-demo-gif.py 渲染的模拟演示。
  有真实录屏后，请用真实录屏替换 assets/demo.gif。
-->
<p align="center">
  <img src="assets/demo.gif" alt="Code Agent 演示 —— 跨会话记住你的偏好" width="90%" />
</p>

```bash
git clone https://github.com/sishenaichipingguo/code-agent && cd code-agent
bun install && export ANTHROPIC_API_KEY=sk-...
bun run dev "记住我用 2 空格缩进，偏好具名导出"
```

## 为什么选 Code Agent？

其他终端助手每次运行都从零开始。你得反复说明自己的技术栈、代码风格、项目约定——每一次都要重来。Code Agent 把记忆当成头等特性：

- 🧠 **跨会话持久记忆** —— 事实以纯 Markdown 形式存放在 `.claude/memory/`，分为 `user`、`project`、`feedback`、`reference` 四类。人类可读、可纳入版本控制、完全归你所有。
- ✨ **自动提取** —— 对话结束后，由一次 LLM 处理自动提炼出值得长期保留的事实（"使用 pnpm"、"API 在 `src/api`"、"不喜欢默认导出"），无需手动管理记忆。
- 🔎 **本地语义检索** —— 可选的 Worker 服务用本地 `all-MiniLM-L6-v2` 模型（384 维，数据不出本机）生成 embedding，存入 SQLite + ChromaDB，对过往工作做相似度检索。
- 👥 **团队记忆** —— 在团队间共享一套整理好的记忆，让约定对每个人都一致，而不是每人各自重新摸索。
- 🔒 **隐私优先** —— embedding 在本地运行；记忆就是你仓库里的文件。除了你自己配置的模型服务商，数据不会发往任何地方。

> 效果：到第三次会话，助手就已经摸清了你项目的运作方式。

## 你期待的其他能力一应俱全

- 🛠️ **内置工具** —— bash、read、write、edit、glob、grep、ls、cp、mv、rm
- 🤖 **多模型** —— 开箱即用 Anthropic Claude，通过 Ollama 支持本地模型
- 🔌 **MCP 支持** —— 连接 Model Context Protocol 服务器，扩展工具与上下文
- 🎯 **YOLO 与 Safe 模式** —— 追求速度时跳过确认，或对高风险操作要求审批
- 🌊 **流式响应**，实时统计 token 与成本
- 🎨 **交互式 UI**（Ink），支持 Tab 补全和键盘快捷键
- 📝 **会话管理** —— 持久化历史，`--continue` 接着上次继续
- 🛑 **优雅退出**，基于 YAML 的配置

## 快速开始

```bash
# 1. 克隆并安装（需要 Bun：https://bun.sh）
git clone https://github.com/sishenaichipingguo/code-agent
cd code-agent
bun install

# 2. 设置 API Key
export ANTHROPIC_API_KEY=your_key_here

# 3. 运行（默认 YOLO 模式）
bun run dev "创建一个 hello.txt 文件"

# Safe 模式会对高风险操作要求审批
bun run dev --mode safe "重构 src/auth.ts"
```

## 记忆系统如何工作

记忆以纯文件形式存在你的项目里，透明且可审阅：

```
.claude/memory/
├── MEMORY.md              # 人类可读索引，按类型分组
├── user_indent-style.md   # "使用 2 空格缩进，偏好具名导出"
├── project_api-layout.md  # "REST 处理函数在 src/api，每个路由一个文件"
└── feedback_pr-style.md   # "PR 描述保持简短，先讲为什么"
```

每条记忆都是带简单 frontmatter（`name`、`description`、`type`、`created`、`updated`）的 Markdown。四种类型：

| 类型 | 记录内容 |
|------|----------|
| `user` | 你的个人偏好与工作风格 |
| `project` | 这个代码库的约定与结构 |
| `feedback` | 你对助手做出的纠正 |
| `reference` | 值得留存的文档、链接与事实 |

### 自动 vs. 显式

- **显式**：直接告诉它——*"记住我们用 Docker Compose 部署"*——它就会写入一条记忆。
- **自动**：`AutoExtractor` 会回顾结束的对话并保存新的长期事实，已在索引中的内容会自动跳过。

### 可选：语义记忆（Worker 服务）

如果要对更长的历史做语义检索，可运行后台 Worker。它在本地生成 embedding，并存入 SQLite + ChromaDB：

```bash
# 启动 Worker（首次运行会下载本地 embedding 模型）
export ANTHROPIC_API_KEY=your_key_here
bun run dev:worker

# 健康检查
curl http://localhost:37777/health
```

Worker 是**非侵入式**的——它是独立进程，CLI 通过 HTTP 与之通信，完全可选。完整架构与数据流见 [README-MEMORY-SYSTEM.md](./README-MEMORY-SYSTEM.md)。

## 配置

在项目中创建 `.agent.yml`：

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

### 通过 Ollama 使用本地模型

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

> **注意：** Ollama 模型不支持工具调用，因此与它们配合时助手运行在纯对话模式。

完整配置项见 `.agent.yml.example`。

## 使用

```bash
agent "你的请求"                       # CLI 模式（简单输出）
agent --ui "你的请求"                  # 交互式 UI（Ink）
agent --mode safe "你的请求"           # 对高风险操作要求审批
agent --model claude-opus-4 "..."     # 指定模型
agent --continue "追加的话"            # 继续上一次会话
```

### UI 模式

- 对文件、工具、命令的 **Tab 补全**
- **键盘快捷键** —— Ctrl+C 退出，方向键浏览历史
- 响应**实时流式**显示
- **状态栏**显示 token 用量与性能

## 构建

```bash
bun run build           # JavaScript 打包
bun run build:binary    # 原生二进制
```

## 架构

- **CLI 层** —— 参数解析与模式判定
- **Agent 核心** —— 带工具执行的主循环
- **记忆系统** —— Markdown 存储、自动提取、团队记忆
- **Worker 服务** —— 可选的语义记忆（SQLite + ChromaDB + 本地 embedding）
- **工具系统** —— 可扩展的工具注册表
- **模型适配器** —— 跨服务商的统一接口
- **基础设施** —— 日志、指标、追踪

## 许可证

MIT
