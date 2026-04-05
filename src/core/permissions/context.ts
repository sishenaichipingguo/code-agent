import type { PermissionContext, PermissionMode, AllowRule, PermissionMatcher } from './types'
import { loadRules, saveRule } from './storage'

const DANGEROUS_TOOLS = new Set(['rm'])
const DANGEROUS_BASH_PREFIXES = ['rm ', 'kill ', 'pkill ', 'chmod ', 'chown ', 'sudo ', 'mkfs', 'dd ']

function isDangerousRule(rule: AllowRule): boolean {
  if (DANGEROUS_TOOLS.has(rule.tool)) return true
  if (rule.tool === 'bash' && rule.matcher.kind === 'bash-prefix') {
    const rulePrefix = rule.matcher.prefix.trimEnd()
    return DANGEROUS_BASH_PREFIXES.some(p => {
      const dangerousCmd = p.trimEnd()
      return rulePrefix === dangerousCmd ||
        rulePrefix.startsWith(dangerousCmd + ' ') ||
        rulePrefix.startsWith(dangerousCmd + '\t')
    })
  }
  return false
}

export function buildPermissionContext(mode: PermissionMode): PermissionContext {
  const persisted = loadRules()
  return { mode, allowRules: persisted, strippedRules: [] }
}

export function enterAutoMode(ctx: PermissionContext): PermissionContext {
  const dangerous = ctx.allowRules.filter(isDangerousRule)
  const safe = ctx.allowRules.filter(r => !isDangerousRule(r))
  return { mode: 'auto', allowRules: safe, strippedRules: dangerous }
}

export function exitAutoMode(ctx: PermissionContext, returnMode: PermissionMode = 'default'): PermissionContext {
  return {
    mode: returnMode,
    allowRules: [...ctx.allowRules, ...ctx.strippedRules],
    strippedRules: []
  }
}

export async function addAllowRule(
  ctx: PermissionContext,
  toolName: string,
  matcher: PermissionMatcher,
  persistent: boolean
): Promise<PermissionContext> {
  const rule: AllowRule = { tool: toolName, matcher, persistent }
  if (persistent) saveRule(rule)
  return { ...ctx, allowRules: [...ctx.allowRules, rule] }
}
