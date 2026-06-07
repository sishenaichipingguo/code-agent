export type HookEvent =
  | 'session-start'
  | 'session-end'
  | 'pre-tool'
  | 'post-tool'
  | 'pre-compress'
  | 'post-compress'
  | 'post-sampling'
  | 'user-prompt-submit'  // 用户提交 prompt 时触发，用于记忆系统初始化
  | 'post-tool-use'       // 工具执行完成后触发，用于记录 observations

export type OnError = 'warn' | 'abort' | 'ignore'

export interface HookEntry {
  command: string
  onError: OnError
  timeout: number
}

export type HooksConfig = Partial<Record<HookEvent, HookEntry[]>>
