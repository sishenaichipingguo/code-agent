# Code Agent

AI-powered coding assistant with enterprise reliability and developer experience.

## 博客系列：从零理解 AI Agent

循序渐进的中文教程，每篇"概念 → 项目实现 → 动手练习"：

| # | 主题 | 核心概念 |
|---|------|---------|
| 1 | [什么是 AI Agent？](docs/blog/01-what-is-agent.md) | ReAct 循环 |
| 2 | [Tool Use](docs/blog/02-tool-use.md) | Function Calling |
| 3 | [权限模型](docs/blog/03-permissions.md) | YOLO vs Safe Mode |
| 4 | [System Prompt 工程](docs/blog/04-system-prompt.md) | 动态组装 |
| 5 | [上下文压缩](docs/blog/05-context-compression.md) | 滑动窗口摘要 |
| 6 | [记忆系统](docs/blog/06-memory.md) | 跨会话持久化 |
| 7 | [多模型支持](docs/blog/07-multi-model.md) | 适配器模式 |
| 8 | [Sub-Agent](docs/blog/08-sub-agent.md) | Agent 调用 Agent |

## Features

- 🚀 **Fast Startup** - < 100ms launch time
- 🎯 **YOLO Mode** - Zero permission checks for maximum speed
- 🔒 **Safe Mode** - Permission-based execution for critical operations
- 🛠️ **Built-in Tools** - bash, read, write, edit, glob, grep, ls, cp, mv, rm
- 🤖 **Multi-Model** - Support for Anthropic Claude and more
- 📊 **Monitoring** - Built-in metrics and tracing
- 🌊 **Streaming** - Real-time AI response streaming
- 💰 **Token Tracking** - Cost monitoring and usage stats
- 📝 **Session Management** - Persistent conversation history
- ⚙️ **Configuration** - YAML-based config system
- 🛑 **Graceful Shutdown** - Safe exit with Ctrl+C
- 🎨 **Interactive UI** - Rich terminal interface with Ink (optional)
- ⌨️ **Smart Completion** - Tab completion for files, tools, and commands
- ⚡ **Keyboard Shortcuts** - Fast navigation and control

## Quick Start

```bash
# Install dependencies
bun install

# Set API key
export ANTHROPIC_API_KEY=your_key_here

# Run in YOLO mode (default)
bun run dev "Create a hello.txt file"

# Run in Safe mode
bun run dev --mode safe "Create a hello.txt file"
```

## Configuration

### Using Anthropic Claude (Default)

Create `.agent.yml` in your project:

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

### Using Local Ollama

```yaml
provider: ollama
baseUrl: http://localhost:11434
model: qwen2.5-coder:7b
mode: yolo
```

**Setup Ollama:**
```bash
# Start Ollama
ollama serve

# Pull a model
ollama pull qwen2.5-coder:7b

# Test
ollama run qwen2.5-coder:7b
```

**Note:** Ollama models don't support tool calling, so the agent will work in chat-only mode.

See [MULTI_MODEL_GUIDE.md](./MULTI_MODEL_GUIDE.md) for more provider options.

See `.agent.yml.example` for full configuration options.

## Usage

```bash
# CLI mode (simple output)
agent "your request here"

# UI mode (interactive interface)
agent --ui "your request here"

# Safe mode (with permission checks)
agent --mode safe "your request here"

# Specify model
agent --model claude-opus-4 "your request here"

# Continue last session
agent --continue "follow up message"
```

### UI Mode Features

- **Tab Completion** - Press Tab for smart completions
- **Keyboard Shortcuts** - Ctrl+C to exit, Arrow keys for history
- **Real-time Streaming** - See AI responses as they're generated
- **Status Bar** - Token usage and performance metrics

## Build

```bash
# Build JavaScript bundle
bun run build

# Build native binary
bun run build:binary
```

## Configuration

Create `.env` file:

```env
ANTHROPIC_API_KEY=your_key_here
AGENT_MODE=yolo
```

## Architecture

- **CLI Layer** - Fast argument parsing and mode detection
- **Agent Core** - Main loop with tool execution
- **Tools System** - Extensible tool registry
- **Model Adapters** - Unified interface for AI models
- **Infrastructure** - Logging, metrics, and tracing

## License

MIT
