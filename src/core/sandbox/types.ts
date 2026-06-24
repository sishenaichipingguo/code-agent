// Pluggable bash sandbox. Each backend wraps a child-process invocation so the
// shell command runs under OS-level isolation (file-write confinement + network
// policy) where the platform supports it, degrading to env scrubbing elsewhere.

export interface SandboxPolicy {
  /** Absolute directories the command is allowed to write to. */
  writeRoots: string[]
  /** Whether outbound network access is permitted. */
  allowNetwork: boolean
}

/** A ready-to-spawn invocation (`file` + `args`) plus the env to run it with. */
export interface SpawnSpec {
  file: string
  args: string[]
  env: NodeJS.ProcessEnv
}

export interface Sandbox {
  readonly name: string
  /** True when this backend enforces the network policy at the kernel level. */
  readonly enforcesNetwork: boolean
  /**
   * Wrap an inner invocation (e.g. `bash -c "<command>"`) so it runs under the
   * sandbox. Backends that cannot isolate return the inner invocation unchanged
   * (with scrubbed env).
   */
  wrap(file: string, args: string[], policy: SandboxPolicy): SpawnSpec
}

// Environment variables that must never leak into a sandboxed shell. Kept to a
// focused, high-risk set (the agent's own provider credentials) so we do not
// surprise users by stripping vars their tooling legitimately needs.
const SCRUBBED_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
]

/** Return a copy of `env` with the agent's provider credentials removed. */
export function scrubEnv(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const scrubbed: NodeJS.ProcessEnv = { ...env }
  for (const key of SCRUBBED_ENV_KEYS) delete scrubbed[key]
  return scrubbed
}
