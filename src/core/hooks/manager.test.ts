import { describe, it, expect } from 'bun:test'
import { HookManager } from './manager'
import type { HooksConfig } from './types'

describe('HookManager', () => {
  describe('fire()', () => {
    it('runs command and resolves on success', async () => {
      const config: HooksConfig = {
        'session-start': [{ command: 'true', onError: 'warn', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      await expect(mgr.fire('session-start', {})).resolves.toBeUndefined()
    })

    it('warns and continues when onError is warn and command fails', async () => {
      const warnings: string[] = []
      const config: HooksConfig = {
        'session-end': [{ command: 'false', onError: 'warn', timeout: 3000 }]
      }
      const mgr = new HookManager(config, (msg) => warnings.push(msg))
      await expect(mgr.fire('session-end', {})).resolves.toBeUndefined()
      expect(warnings.length).toBeGreaterThan(0)
    })

    it('throws when onError is abort and command fails', async () => {
      const config: HooksConfig = {
        'pre-tool': [{ command: 'false', onError: 'abort', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      await expect(mgr.fire('pre-tool', { AGENT_TOOL_NAME: 'bash' })).rejects.toThrow()
    })

    it('silently ignores failure when onError is ignore', async () => {
      const warnings: string[] = []
      const config: HooksConfig = {
        'post-tool': [{ command: 'false', onError: 'ignore', timeout: 3000 }]
      }
      const mgr = new HookManager(config, (msg) => warnings.push(msg))
      await expect(mgr.fire('post-tool', {})).resolves.toBeUndefined()
      expect(warnings.length).toBe(0)
    })

    it('does nothing when event has no hooks configured', async () => {
      const config: HooksConfig = {}
      const mgr = new HookManager(config)
      await expect(mgr.fire('session-start', {})).resolves.toBeUndefined()
    })

    it('passes environment variables to the command', async () => {
      const config: HooksConfig = {
        'post-tool': [{ command: 'bash -c "test \\"$AGENT_TOOL_NAME\\" = mybash"', onError: 'abort', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      await expect(mgr.fire('post-tool', { AGENT_TOOL_NAME: 'mybash' })).resolves.toBeUndefined()
    })
  })

  describe('transform()', () => {
    it('returns original payload when stdout is empty', async () => {
      const config: HooksConfig = {
        'pre-compress': [{ command: 'true', onError: 'warn', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      const payload = { messages: [{ role: 'user', content: 'hi' }] }
      const result = await mgr.transform('pre-compress', payload, {})
      expect(result).toEqual(payload)
    })

    it('returns modified payload from stdout JSON', async () => {
      const modified = { messages: [{ role: 'user', content: 'modified' }] }
      const json = JSON.stringify(modified)
      const config: HooksConfig = {
        'pre-compress': [{ command: `bash -c "echo '${json.replace(/"/g, '\\"')}'"`, onError: 'warn', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      const payload = { messages: [{ role: 'user', content: 'original' }] }
      const result = await mgr.transform('pre-compress', payload, {})
      expect(result).toEqual(modified)
    })

    it('returns original payload when stdout is not valid JSON', async () => {
      const config: HooksConfig = {
        'post-sampling': [{ command: 'bash -c "echo not-json"', onError: 'warn', timeout: 3000 }]
      }
      const mgr = new HookManager(config)
      const payload = { text: 'hello' }
      const result = await mgr.transform('post-sampling', payload, {})
      expect(result).toEqual(payload)
    })
  })
})
