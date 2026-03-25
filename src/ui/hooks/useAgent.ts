import { useState, useCallback } from 'react'
import type { ModelAdapter } from '@/core/models/adapter'
import type { ToolRegistry } from '@/core/tools/registry'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface UseAgentOptions {
  model: ModelAdapter
  tools: ToolRegistry
  mode: 'yolo' | 'safe'
}

export function useAgent(options: UseAgentOptions) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const sendMessage = useCallback(async function* (text: string) {
    setIsProcessing(true)

    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    setMessages(prev => [...prev, userMsg])

    try {
      // Use streaming if available
      if (options.model.chatStream) {
        const stream = options.model.chatStream(
          [{ role: 'user', content: text }],
          options.tools
        )

        for await (const chunk of stream) {
          yield chunk
        }
      }
    } finally {
      setIsProcessing(false)
    }
  }, [options])

  return {
    messages,
    isProcessing,
    sendMessage
  }
}
