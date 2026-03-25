import React from 'react'
import { Box } from 'ink'
import { Message } from './Message'

interface MessageListProps {
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {messages.map((msg, i) => (
        <Message key={i} role={msg.role} content={msg.content} />
      ))}
    </Box>
  )
}
