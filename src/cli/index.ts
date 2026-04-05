#!/usr/bin/env bun
// Fast entry point - minimal imports for quick startup
import { parseArgs } from './parser'
import { detectMode } from './mode'

const args = parseArgs(process.argv.slice(2))
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

// UI mode
if (args.ui) {
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
