import type { Sandbox, SandboxPolicy, SpawnSpec } from './types'
import { scrubEnv } from './types'

/**
 * Best-effort fallback for platforms without a kernel sandbox (Windows, or when
 * sandbox-exec / bwrap is missing). It cannot confine the filesystem or network,
 * but it still keeps the agent's provider credentials out of the child env.
 */
export class RestrictedSandbox implements Sandbox {
  readonly name = 'restricted'
  readonly enforcesNetwork = false

  wrap(file: string, args: string[], _policy: SandboxPolicy): SpawnSpec {
    return { file, args, env: scrubEnv() }
  }
}
