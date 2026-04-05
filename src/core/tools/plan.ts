import type { Tool } from './registry'
import { PlanManager } from '../plan/manager'

let planManager: PlanManager | null = null

export function initPlanManager(projectRoot: string) {
  planManager = new PlanManager(projectRoot)
}

export function getPlanManager(): PlanManager {
  if (!planManager) throw new Error('PlanManager not initialized')
  return planManager
}

export class EnterPlanModeTool implements Tool {
  name = 'enter_plan_mode'
  description = 'Enter plan mode for complex tasks'
  inputSchema = {
    type: 'object',
    properties: {
      sessionId: { type: 'string' }
    },
    required: ['sessionId']
  }

  isConcurrencySafe = () => false
  isReadOnly = () => false
  isDestructive = () => false
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(input: any): Promise<string> {
    const state = getPlanManager().enter(input.sessionId)
    return `Entered plan mode. Plan file: ${state.planFile}`
  }
}

export class ExitPlanModeTool implements Tool {
  name = 'exit_plan_mode'
  description = 'Exit plan mode and get approval'
  inputSchema = { type: 'object', properties: {} }

  isConcurrencySafe = () => false
  isReadOnly = () => false
  isDestructive = () => false
  checkPermissions = () => ({ type: 'allow' as const })
  preparePermissionMatcher = () => null

  async execute(): Promise<string> {
    const result = getPlanManager().exit()
    return `Plan approved:\n${result.planContent}`
  }
}
