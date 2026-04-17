import React from 'react'
import { Box, Text } from 'ink'

interface MessageProps {
  role: 'user' | 'assistant'
  content: string
}

export function Message({ role, content }: MessageProps) {
  const prefix = role === 'user' ? '❯' : '◆'
  const color = role === 'user' ? 'cyan' : 'green'
  const label = role === 'user' ? 'You' : 'Assistant'

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>{prefix} </Text>
        <Text color={color} bold>{label}</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text>{content}</Text>
      </Box>
    </Box>
  )
}
