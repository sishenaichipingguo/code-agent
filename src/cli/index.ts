#!/usr/bin/env bun
// Fast entry point - minimal imports for quick startup
import { parseArgs } from './parser'
import { detectMode } from './mode'

const args = parseArgs(process.argv.slice(2))
const mode = detectMode(args)

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
