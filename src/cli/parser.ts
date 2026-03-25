// Minimal argument parser for fast startup
export interface Args {
  message?: string
  mode?: 'yolo' | 'safe'
  model?: string
  verbose?: boolean
  ui?: boolean
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--mode' && argv[i + 1]) {
      args.mode = argv[++i] as 'yolo' | 'safe'
    } else if (arg === '--model' && argv[i + 1]) {
      args.model = argv[++i]
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true
    } else if (arg === '--ui') {
      args.ui = true
    } else if (!arg.startsWith('-')) {
      args.message = arg
    }
  }

  return args
}
