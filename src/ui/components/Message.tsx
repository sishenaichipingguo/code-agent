import React from 'react'
import { Box, Text } from 'ink'

interface MessageProps {
  role: 'user' | 'assistant'
  content: string
}

export function Message({ role, content }: MessageProps) {
  const icon = role === 'user' ? '👤' : '🤖'
  const color = role === 'user' ? 'cyan' : 'green'

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color={color} bold>{icon} {role === 'user' ? 'You' : 'Assistant'}:</Text>
      </Box>
      <Box paddingLeft={3}>
        <Text>{content}</Text>
      </Box>
    </Box>
  )
}
