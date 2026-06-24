import type { Sandbox, SandboxPolicy, SpawnSpec } from './types'
import { scrubEnv } from './types'

/** Explicit opt-out: run the command exactly as given, with scrubbed env. */
export class NoneSandbox implements Sandbox {
  readonly name = 'none'
  readonly enforcesNetwork = false

  wrap(file: string, args: string[], _policy: SandboxPolicy): SpawnSpec {
    return { file, args, env: scrubEnv() }
  }
}
