import type { Sandbox, SandboxPolicy, SpawnSpec } from './types'
import { scrubEnv } from './types'

/**
 * Build a Seatbelt (SBPL) profile: deny-by-default, read anywhere, write only
 * under tmp + the configured roots, and network per policy.
 */
export function buildSeatbeltProfile(policy: SandboxPolicy): string {
  const writeSubpaths = [
    '/private/tmp',
    '/private/var/folders',
    ...policy.writeRoots,
  ]
  const writeRules = writeSubpaths
    .map(p => `  (subpath ${JSON.stringify(p)})`)
    .join('\n')

  return [
    '(version 1)',
    '(deny default)',
    '(allow process-exec)',
    '(allow process-fork)',
    '(allow signal (target self))',
    '(allow sysctl-read)',
    '(allow mach-lookup)',
    '(allow file-read*)',
    '(allow file-write-data (literal "/dev/null") (literal "/dev/stdout") (literal "/dev/stderr") (literal "/dev/tty"))',
    '(allow file-write*',
    writeRules,
    ')',
    policy.allowNetwork ? '(allow network*)' : '(deny network*)',
  ].join('\n')
}

/** macOS kernel sandbox via the (deprecated but still functional) sandbox-exec. */
export class SeatbeltSandbox implements Sandbox {
  readonly name = 'seatbelt'
  readonly enforcesNetwork = true

  wrap(file: string, args: string[], policy: SandboxPolicy): SpawnSpec {
    const profile = buildSeatbeltProfile(policy)
    return {
      file: 'sandbox-exec',
      args: ['-p', profile, file, ...args],
      env: scrubEnv(),
    }
  }
}
