// src/core/permissions/engine.test.ts
import { describe, it, expect } from 'bun:test'
import { decide } from './engine'
import type { PermissionCapable, PermissionContext, AllowRule } from './types'

function makeCtx(
  mode: PermissionContext['mode'],
  rules: AllowRule[] = []
): PermissionContext {
  return { mode, allowRules: rules, strippedRules: [] }
}

function makeTool(result: ReturnType<PermissionCapable['checkPermissions']>): PermissionCapable {
  return {
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    isDestructive: () => false,
    checkPermissions: () => result,
    preparePermissionMatcher: () => null,
  }
}

describe('decide', () => {
  it('bypass mode always returns allow regardless of tool', () => {
    const tool = makeTool({ type: 'deny', reason: 'should not matter' })
    expect(decide(tool, {}, makeCtx('bypass'))).toEqual({ type: 'allow' })
  })

  it('tool deny is hard block — cannot be overridden by rules', () => {
    const rule: AllowRule = {
      tool: 'rm', matcher: { kind: 'path-glob', glob: '**' }, persistent: false
    }
    const tool = makeTool({ type: 'deny', reason: 'rm always blocked in auto' })
    const result = decide(tool, {}, makeCtx('default', [rule]), 'rm')
    expect(result).toEqual({ type: 'deny', reason: 'rm always blocked in auto' })
  })

  it('matching allow rule returns allow', () => {
    const rule: AllowRule = {
      tool: 'bash', matcher: { kind: 'bash-prefix', prefix: 'git' }, persistent: false
    }
    const tool = makeTool({ type: 'ask', description: 'Run git?' })
    const result = decide(tool, { command: 'git status' }, makeCtx('default', [rule]), 'bash')
    expect(result).toEqual({ type: 'allow' })
  })

  it('no matching rule falls through to tool result', () => {
    const tool = makeTool({ type: 'ask', description: 'Run bash command?' })
    const result = decide(tool, { command: 'npm install' }, makeCtx('default'), 'bash')
    expect(result).toEqual({ type: 'ask', description: 'Run bash command?' })
  })

  it('auto mode with no rule and ask result becomes deny', () => {
    const tool = makeTool({ type: 'ask', description: 'Run rm?' })
    const result = decide(tool, { path: '/tmp/foo' }, makeCtx('auto'), 'rm')
    expect(result).toEqual({ type: 'deny', reason: 'auto mode: operation requires confirmation — use default mode or add an allow rule' })
  })

  it('auto mode with matching rule still allows', () => {
    const rule: AllowRule = {
      tool: 'bash', matcher: { kind: 'bash-prefix', prefix: 'git' }, persistent: false
    }
    const tool = makeTool({ type: 'ask', description: 'Run bash?' })
    const result = decide(tool, { command: 'git push' }, makeCtx('auto', [rule]), 'bash')
    expect(result).toEqual({ type: 'allow' })
  })
})
