export interface PlanState {
  active: boolean
  planFile: string
  phase: 'exploration' | 'design' | 'planning' | 'review'
  startTime: Date
}
