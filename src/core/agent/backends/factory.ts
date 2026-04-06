import type { AgentBackend, BackendType } from './types'
import { InProcessBackend } from './in-process'
import { TmuxBackend } from './tmux'
import { ITerm2Backend } from './iterm2'

export class BackendFactory {
  /**
   * Auto-detect the best available backend:
   * iTerm2 (macOS only) > tmux > in-process
   */
  static detect(): AgentBackend {
    if (process.platform === 'darwin' && process.env.ITERM_SESSION_ID) {
      return new ITerm2Backend()
    }
    if (process.env.TMUX) {
      return new TmuxBackend()
    }
    return new InProcessBackend()
  }

  static create(type: BackendType): AgentBackend {
    switch (type) {
      case 'tmux':   return new TmuxBackend()
      case 'iterm2': return new ITerm2Backend()
      default:       return new InProcessBackend()
    }
  }
}
