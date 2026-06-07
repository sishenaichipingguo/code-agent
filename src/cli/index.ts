#!/usr/bin/env bun
// Fast entry point - minimal imports for quick startup
import { parseArgs } from './parser'
import { detectMode } from './mode'

const args = parseArgs(process.argv.slice(2))

// Handle invalid arguments
if (args.invalidArgs && args.invalidArgs.length > 0) {
  console.error(`Error: Unknown option(s): ${args.invalidArgs.join(', ')}`)
  console.error('Run "agent --help" for usage information')
  process.exit(1)
}

// Handle --help
if (args.help) {
  console.log(`
Usage: agent [options] [message]

Options:
  -h, --help              Show this help message
  -V, --version           Show version number
  --mode <mode>           Run mode: yolo (default) or safe
  --model <model>         AI model to use
  --config <path>         Config file path
  --session <id>          Load specific session
  -r, --resume            Resume last session
  -v, --verbose           Verbose output
  --ui                    Interactive UI mode
  --with-memory           Enable memory system (auto-starts Worker Service)
  --mcp-serve             Start as MCP server
  --port <port>           MCP server port

Examples:
  agent "Create a hello.txt file"
  agent --mode safe "Delete old files"
  agent --with-memory "Refactor auth.ts"
  agent --ui
  `)
  process.exit(0)
}

// Handle --version
if (args.version) {
  const pkg = require('../../package.json')
  console.log(pkg.version)
  process.exit(0)
}

const mode = detectMode(args)

// MCP standalone server mode
if (args.mcpServe) {
  const { loadConfig } = await import('@/core/config/loader')
  const { createToolRegistry } = await import('@/core/tools/registry')
  const { startMcpServer } = await import('@/core/mcp/server')
  const config = await loadConfig(args.config)
  if (args.port) {
    // --port implies HTTP transport; set up or override expose config accordingly
    if (!config.mcp) config.mcp = {}
    if (!config.mcp.expose) {
      config.mcp.expose = { tools: ['read', 'glob', 'grep', 'ls'], transport: 'http', port: args.port }
    } else {
      config.mcp.expose = { ...config.mcp.expose, transport: 'http', port: args.port }
    }
  }
  const registry = await createToolRegistry()
  await startMcpServer(config, registry)
  // Event loop keeps the process alive (stdio: stdin open; http: server listening)
}

// UI mode: explicit --ui flag, or no message provided (interactive by default)
if (args.ui || (!args.message && !args.mcpServe)) {
  if (mode === 'yolo') {
    const { runYoloUI } = await import('./yolo-ui')
    await runYoloUI(args)
  } else {
    console.log('UI mode for Safe not yet implemented')
    process.exit(1)
  }
} else {
  // CLI mode
  if (mode === 'yolo') {
    const { runYolo } = await import('./yolo')
    await runYolo(args)
  } else {
    const { runSafe } = await import('./safe')
    await runSafe(args)
  }
}
