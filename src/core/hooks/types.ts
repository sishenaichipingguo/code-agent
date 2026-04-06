export type HookEvent =
  | 'session-start'
  | 'session-end'
  | 'pre-tool'
  | 'post-tool'
  | 'pre-compress'
  | 'post-compress'
  | 'post-sampling'

export type OnError = 'warn' | 'abort' | 'ignore'

export interface HookEntry {
  command: string
  on_error: OnError
  timeout: number
}

export type HooksConfig = Partial<Record<HookEvent, HookEntry[]>>
