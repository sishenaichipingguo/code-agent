import type { Args } from './parser'

export type Mode = 'yolo' | 'safe'

export function detectMode(args: Args): Mode {
  // CLI argument takes precedence
  if (args.mode) return args.mode

  // Environment variable
  const envMode = process.env.AGENT_MODE
  if (envMode === 'safe') return 'safe'

  // Default to YOLO for speed
  return 'yolo'
}
