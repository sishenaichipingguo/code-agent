// src/core/permissions/engine.ts
import type { PermissionCapable, PermissionContext, PermissionResult } from './types'
import { matchesRule } from './matcher'

export function decide(
  tool: PermissionCapable,
  input: unknown,
  ctx: PermissionContext,
  toolName = ''
): PermissionResult {
  if (ctx.mode === 'bypass') return { type: 'allow' }

  const toolResult = tool.checkPermissions(input, ctx)
  if (toolResult.type === 'deny') return toolResult

  const matched = ctx.allowRules.some(rule => matchesRule(rule, toolName, input))
  if (matched) return { type: 'allow' }

  if (toolResult.type === 'allow') return { type: 'allow' }

  if (ctx.mode === 'auto') {
    return {
      type: 'deny',
      reason: 'auto mode: operation requires confirmation — use default mode or add an allow rule'
    }
  }

  return toolResult
}
