# Code Agent

AI-powered coding assistant with enterprise reliability and developer experience.

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

Create `.agent.yml` in your project:

```yaml
model: claude-sonnet-4
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
