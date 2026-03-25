import React, { useState, useEffect } from 'react'
import { Box, render } from 'ink'
import { Header } from './components/Header'
import { MessageList } from './components/MessageList'
import { InputBox } from './components/InputBox'
import { StatusBar } from './components/StatusBar'
import { useKeyboard } from './hooks/useKeyboard'
import { CompletionEngine } from '@/core/completion/engine'
import { FilePathCompletionProvider } from '@/core/completion/providers/file-path'
import { ToolCompletionProvider } from '@/core/completion/providers/tool'
import { CommandCompletionProvider } from '@/core/completion/providers/command'
import { HistoryCompletionProvider } from '@/core/completion/providers/history'
import { HistoryManager } from '@/core/history/manager'
import type { Completion } from '@/core/completion/engine'

interface AppProps {
  model: string
  mode: 'yolo' | 'safe'
  onMessage: (text: string) => AsyncGenerator<any>
}

export function App({ model, mode, onMessage }: AppProps) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [completions, setCompletions] = useState<Completion[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [historyManager] = useState(() => new HistoryManager())
  const [completionEngine] = useState(() => {
    const engine = new CompletionEngine()
    engine.registerProvider(new FilePathCompletionProvider())
    engine.registerProvider(new ToolCompletionProvider())
    engine.registerProvider(new CommandCompletionProvider())
    engine.registerProvider(new HistoryCompletionProvider(historyManager))
    return engine
  })

  useEffect(() => {
    historyManager.init()
  }, [])

  useKeyboard({
    onExit: () => process.exit(0),
    onClear: () => setMessages([]),
    onHistoryUp: async () => {
      const recent = await historyManager.getRecent()
      if (historyIndex < recent.length - 1) {
        setHistoryIndex(historyIndex + 1)
      }
    },
    onHistoryDown: () => {
      if (historyIndex > -1) {
        setHistoryIndex(historyIndex - 1)
      }
    }
  })

  const handleSubmit = async (text: string) => {
    setIsProcessing(true)
    setMessages(prev => [...prev, { role: 'user', content: text }])

    // Add to history
    await historyManager.add(text, true)
    setHistoryIndex(-1)

    let assistantContent = ''

    try {
      for await (const chunk of onMessage(text)) {
        if (chunk.type === 'text' && chunk.content) {
          assistantContent += chunk.content
          setMessages(prev => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant') {
              return [...prev.slice(0, -1), { role: 'assistant', content: assistantContent }]
            }
            return [...prev, { role: 'assistant', content: assistantContent }]
          })
        }
      }
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRequestCompletions = async (text: string, cursor: number) => {
    const results = await completionEngine.complete(text, cursor)
    setCompletions(results)
  }

  return (
    <Box flexDirection="column" height="100%">
      <Header model={model} mode={mode} />
      <MessageList messages={messages} />
      <InputBox
        onSubmit={handleSubmit}
        disabled={isProcessing}
        completions={completions}
        onRequestCompletions={handleRequestCompletions}
      />
      <StatusBar />
    </Box>
  )
}
