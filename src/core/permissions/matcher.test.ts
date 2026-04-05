import { describe, it, expect } from 'bun:test'
import { matchesRule } from './matcher'
import type { AllowRule } from './types'

function bashRule(prefix: string): AllowRule {
  return { tool: 'bash', matcher: { kind: 'bash-prefix', prefix }, persistent: false }
}
function pathRule(tool: string, glob: string): AllowRule {
  return { tool, matcher: { kind: 'path-glob', glob }, persistent: false }
}

describe('matchesRule', () => {
  describe('bash-prefix matcher', () => {
    it('matches command starting with the prefix', () => {
      expect(matchesRule(bashRule('git '), 'bash', { command: 'git status' })).toBe(true)
    })
    it('matches exact command equal to prefix (trailing space stripped)', () => {
      expect(matchesRule(bashRule('git'), 'bash', { command: 'git' })).toBe(true)
    })
    it('does not match different prefix', () => {
      expect(matchesRule(bashRule('git '), 'bash', { command: 'npm install' })).toBe(false)
    })
    it('does not match when tool name differs', () => {
      expect(matchesRule(bashRule('git '), 'write', { command: 'git status' })).toBe(false)
    })
    it('ignores rule when input has no command field', () => {
      expect(matchesRule(bashRule('git '), 'bash', { path: '/tmp/foo' })).toBe(false)
    })
  })

  describe('path-glob matcher', () => {
    it('matches exact path', () => {
      expect(matchesRule(pathRule('write', '/tmp/foo.ts'), 'write', { path: '/tmp/foo.ts' })).toBe(true)
    })
    it('matches glob wildcard', () => {
      expect(matchesRule(pathRule('write', '/tmp/**'), 'write', { path: '/tmp/sub/foo.ts' })).toBe(true)
    })
    it('does not match path outside glob', () => {
      expect(matchesRule(pathRule('write', '/tmp/**'), 'write', { path: '/etc/passwd' })).toBe(false)
    })
    it('does not match when tool name differs', () => {
      expect(matchesRule(pathRule('write', '/tmp/**'), 'rm', { path: '/tmp/foo' })).toBe(false)
    })
    it('ignores rule when input has no path field', () => {
      expect(matchesRule(pathRule('write', '/tmp/**'), 'write', { command: 'echo hi' })).toBe(false)
    })
  })
})
