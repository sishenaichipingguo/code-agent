import { useInput } from 'ink'

export interface KeyHandlers {
  onExit?: () => void
  onClear?: () => void
  onSearchHistory?: () => void
  onOpenEditor?: () => void
  onHistoryUp?: () => void
  onHistoryDown?: () => void
  onComplete?: () => void
}

export function useKeyboard(handlers: KeyHandlers) {
  useInput((input, key) => {
    // Ctrl + C - Exit
    if (key.ctrl && input === 'c') {
      handlers.onExit?.()
    }

    // Ctrl + L - Clear
    if (key.ctrl && input === 'l') {
      handlers.onClear?.()
    }

    // Ctrl + R - Search History
    if (key.ctrl && input === 'r') {
      handlers.onSearchHistory?.()
    }

    // Ctrl + E - Open Editor
    if (key.ctrl && input === 'e') {
      handlers.onOpenEditor?.()
    }

    // Arrow keys
    if (key.upArrow) {
      handlers.onHistoryUp?.()
    }

    if (key.downArrow) {
      handlers.onHistoryDown?.()
    }

    // Tab
    if (key.tab) {
      handlers.onComplete?.()
    }
  })
}
