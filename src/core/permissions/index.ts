export type {
  PermissionMode, PermissionResult, PermissionMatcher,
  AllowRule, PermissionContext, PermissionCapable
} from './types'
export { matchesRule } from './matcher'
export { decide } from './engine'
export { buildPermissionContext, enterAutoMode, exitAutoMode, addAllowRule } from './context'
