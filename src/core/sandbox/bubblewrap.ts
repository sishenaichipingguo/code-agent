import type { Sandbox, SandboxPolicy, SpawnSpec } from './types'
import { scrubEnv } from './types'

/**
 * Build bubblewrap args: bind the whole filesystem read-only, give a fresh
 * tmpfs /tmp, re-bind the configured roots read-write, and unshare the network
 * namespace unless network is allowed.
 */
export function buildBwrapArgs(policy: SandboxPolicy): string[] {
  const args = [
    '--ro-bind',
    '/',
    '/',
    '--dev',
    '/dev',
    '--proc',
    '/proc',
    '--tmpfs',
    '/tmp',
    '--die-with-parent',
  ]
  for (const root of policy.writeRoots) {
    args.push('--bind', root, root)
  }
  if (!policy.allowNetwork) args.push('--unshare-net')
  return args
}

/** Linux kernel sandbox via bubblewrap (bwrap). */
export class BubblewrapSandbox implements Sandbox {
  readonly name = 'bubblewrap'
  readonly enforcesNetwork = true

  wrap(file: string, args: string[], policy: SandboxPolicy): SpawnSpec {
    return {
      file: 'bwrap',
      args: [...buildBwrapArgs(policy), file, ...args],
      env: scrubEnv(),
    }
  }
}
