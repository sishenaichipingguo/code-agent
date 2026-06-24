import { existsSync } from 'fs'
import { join, delimiter } from 'path'
import type { Sandbox } from './types'
import { NoneSandbox } from './none'
import { RestrictedSandbox } from './restricted'
import { SeatbeltSandbox } from './seatbelt'
import { BubblewrapSandbox } from './bubblewrap'

export type SandboxBackend =
  | 'auto'
  | 'seatbelt'
  | 'bubblewrap'
  | 'restricted'
  | 'none'

export interface SandboxFactoryOptions {
  backend?: SandboxBackend
  enabled?: boolean
  /** Defaults to the host platform; injectable for testing. */
  platform?: NodeJS.Platform
  /** Binary-availability check; injectable for testing. */
  exists?: (binary: string) => boolean
  warn?: (message: string) => void
}

function binaryOnPath(binary: string): boolean {
  const path = process.env.PATH ?? ''
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : ['']
  return path
    .split(delimiter)
    .some(dir => !!dir && exts.some(ext => existsSync(join(dir, binary + ext))))
}

/**
 * Select a sandbox backend from config + platform, degrading to RestrictedSandbox
 * (run with a warning, no kernel isolation) when the chosen backend is unavailable.
 */
export function createSandbox(options: SandboxFactoryOptions = {}): Sandbox {
  const {
    backend = 'auto',
    enabled = true,
    platform = process.platform,
    exists = binaryOnPath,
    warn = (m: string) => process.stderr.write(`⚠️  ${m}\n`),
  } = options

  if (!enabled || backend === 'none') return new NoneSandbox()
  if (backend === 'restricted') return new RestrictedSandbox()

  const wantSeatbelt =
    backend === 'seatbelt' || (backend === 'auto' && platform === 'darwin')
  if (wantSeatbelt) {
    if (exists('sandbox-exec')) return new SeatbeltSandbox()
    warn('sandbox-exec not found — running bash without OS isolation')
    return new RestrictedSandbox()
  }

  const wantBwrap =
    backend === 'bubblewrap' || (backend === 'auto' && platform === 'linux')
  if (wantBwrap) {
    if (exists('bwrap')) return new BubblewrapSandbox()
    warn('bwrap (bubblewrap) not found — running bash without OS isolation')
    return new RestrictedSandbox()
  }

  // Windows and anything else: no kernel sandbox available out of the box.
  warn(
    `no OS sandbox backend for platform "${platform}" — running bash with reduced protection`
  )
  return new RestrictedSandbox()
}
