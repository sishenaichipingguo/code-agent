// Minimal argument parser for fast startup
export interface Args {
  message?: string
  mode?: 'yolo' | 'safe'
  model?: string
  config?: string
  verbose?: boolean
  ui?: boolean
  resume?: boolean    // load last session and continue
  session?: string    // load specific session id and continue
  mcpServe?: boolean  // start as standalone MCP server
  port?: number       // port for MCP HTTP transport
  withMemory?: boolean // enable memory system with Worker Service
  help?: boolean      // show help message
  version?: boolean   // show version
  invalidArgs?: string[]  // track invalid arguments
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { invalidArgs: [] }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--help' || arg === '-h') {
      args.help = true
    } else if (arg === '--version' || arg === '-V') {
      args.version = true
    } else if (arg === '--mode' && argv[i + 1]) {
      args.mode = argv[++i] as 'yolo' | 'safe'
    } else if (arg === '--model' && argv[i + 1]) {
      args.model = argv[++i]
    } else if (arg === '--config' && argv[i + 1]) {
      args.config = argv[++i]
    } else if (arg === '--session' && argv[i + 1]) {
      args.session = argv[++i]
    } else if (arg === '--resume' || arg === '-r') {
      args.resume = true
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true
    } else if (arg === '--ui') {
      args.ui = true
    } else if (arg === '--mcp-serve') {
      args.mcpServe = true
    } else if (arg === '--port' && argv[i + 1]) {
      args.port = parseInt(argv[++i], 10)
    } else if (arg === '--with-memory') {
      args.withMemory = true
    } else if (arg.startsWith('-')) {
      // Unknown flag
      args.invalidArgs!.push(arg)
    } else {
      args.message = arg
    }
  }

  return args
}
