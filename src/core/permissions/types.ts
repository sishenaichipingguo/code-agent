// src/core/permissions/types.ts

export type PermissionMode = 'bypass' | 'default' | 'auto'

/** Returned by tool.checkPermissions() */
export type PermissionResult =
  | { type: 'allow' }
  | { type: 'deny';  reason: string }
  | { type: 'ask';   description: string }

/** A matcher produced by a tool so the rule engine can match future calls */
export type PermissionMatcher =
  | { kind: 'bash-prefix'; prefix: string }
  | { kind: 'path-glob';   glob: string }

export interface AllowRule {
  tool: string
  matcher: PermissionMatcher
  /** true = persisted to disk; false = session-only */
  persistent: boolean
}

export interface PermissionContext {
  mode: PermissionMode
  allowRules: AllowRule[]
  /** Rules stripped when entering auto mode; restored on exit */
  strippedRules: AllowRule[]
}

/** Methods every Tool must expose for the permission system */
export interface PermissionCapable {
  isConcurrencySafe(input: unknown): boolean
  isReadOnly(input: unknown): boolean
  isDestructive(input: unknown): boolean
  checkPermissions(input: unknown, ctx: PermissionContext): PermissionResult
  preparePermissionMatcher(input: unknown): PermissionMatcher | null
}
