// src/core/permissions/types.test.ts
import { describe, it, expect } from 'bun:test'
import type {
  PermissionResult, PermissionMatcher, AllowRule, PermissionContext
} from './types'

describe('permission types', () => {
  it('PermissionResult allow is assignable', () => {
    const r: PermissionResult = { type: 'allow' }
    expect(r.type).toBe('allow')
  })

  it('PermissionResult deny carries reason', () => {
    const r: PermissionResult = { type: 'deny', reason: 'auto mode blocks rm' }
    expect(r.type).toBe('deny')
    if (r.type === 'deny') expect(r.reason).toBeTruthy()
  })

  it('PermissionResult ask carries description', () => {
    const r: PermissionResult = { type: 'ask', description: 'Delete /tmp/foo?' }
    expect(r.type).toBe('ask')
    if (r.type === 'ask') expect(r.description).toBeTruthy()
  })

  it('PermissionContext shape is correct', () => {
    const ctx: PermissionContext = {
      mode: 'default',
      allowRules: [],
      strippedRules: []
    }
    expect(ctx.mode).toBe('default')
    expect(Array.isArray(ctx.allowRules)).toBe(true)
    expect(Array.isArray(ctx.strippedRules)).toBe(true)
  })
})
