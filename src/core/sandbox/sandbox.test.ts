import { describe, it, expect } from 'bun:test'
import { createSandbox } from './factory'
import { buildSeatbeltProfile } from './seatbelt'
import { buildBwrapArgs } from './bubblewrap'
import { scrubEnv } from './types'

const yes = () => true
const no = () => false
const silent = () => {}

describe('createSandbox selection', () => {
  it('returns NoneSandbox when disabled', () => {
    expect(createSandbox({ enabled: false }).name).toBe('none')
  })

  it('returns NoneSandbox when backend is none', () => {
    expect(createSandbox({ backend: 'none' }).name).toBe('none')
  })

  it('selects seatbelt on darwin when available', () => {
    const sb = createSandbox({ platform: 'darwin', exists: yes })
    expect(sb.name).toBe('seatbelt')
    expect(sb.enforcesNetwork).toBe(true)
  })

  it('falls back to restricted on darwin when sandbox-exec is missing', () => {
    const sb = createSandbox({ platform: 'darwin', exists: no, warn: silent })
    expect(sb.name).toBe('restricted')
  })

  it('selects bubblewrap on linux when available', () => {
    const sb = createSandbox({ platform: 'linux', exists: yes })
    expect(sb.name).toBe('bubblewrap')
  })

  it('falls back to restricted on linux when bwrap is missing', () => {
    const sb = createSandbox({ platform: 'linux', exists: no, warn: silent })
    expect(sb.name).toBe('restricted')
  })

  it('uses restricted on win32 with a warning', () => {
    let warned = false
    const sb = createSandbox({
      platform: 'win32',
      warn: () => {
        warned = true
      },
    })
    expect(sb.name).toBe('restricted')
    expect(warned).toBe(true)
  })
})

describe('seatbelt profile', () => {
  it('denies network by default and confines writes to the roots', () => {
    const profile = buildSeatbeltProfile({
      writeRoots: ['/work/project'],
      allowNetwork: false,
    })
    expect(profile).toContain('(deny default)')
    expect(profile).toContain('(deny network*)')
    expect(profile).toContain('(subpath "/work/project")')
  })

  it('allows network when policy permits', () => {
    const profile = buildSeatbeltProfile({ writeRoots: [], allowNetwork: true })
    expect(profile).toContain('(allow network*)')
  })
})

describe('bubblewrap args', () => {
  it('unshares the network when disallowed and binds write roots', () => {
    const args = buildBwrapArgs({
      writeRoots: ['/work/project'],
      allowNetwork: false,
    })
    expect(args).toContain('--unshare-net')
    const bindIdx = args.indexOf('--bind')
    expect(args[bindIdx + 1]).toBe('/work/project')
  })

  it('keeps the network namespace when allowed', () => {
    const args = buildBwrapArgs({ writeRoots: [], allowNetwork: true })
    expect(args).not.toContain('--unshare-net')
  })
})

describe('scrubEnv', () => {
  it('removes provider credentials', () => {
    const result = scrubEnv({ ANTHROPIC_API_KEY: 'secret', PATH: '/usr/bin' })
    expect(result.ANTHROPIC_API_KEY).toBeUndefined()
    expect(result.PATH).toBe('/usr/bin')
  })
})
