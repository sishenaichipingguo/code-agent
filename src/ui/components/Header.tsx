import React from 'react'
import { Box, Text } from 'ink'

interface HeaderProps {
  model: string
  mode: 'yolo' | 'safe'
  session?: string
}

export function Header({ model, mode, session }: HeaderProps) {
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box>
        <Text bold color="cyan">▲ Code Agent</Text>
        <Text dimColor> v0.1.0</Text>
      </Box>
      <Box>
        <Text dimColor>Model: </Text>
        <Text>{model}</Text>
        <Text dimColor> · </Text>
        <Text color={mode === 'yolo' ? 'yellow' : 'green'}>
          {mode.toUpperCase()}
        </Text>
        {session && (
          <>
            <Text dimColor> · </Text>
            <Text dimColor>{session.slice(0, 8)}</Text>
          </>
        )}
      </Box>
      <Box>
        <Text dimColor>{'─'.repeat(80)}</Text>
      </Box>
    </Box>
  )
}
