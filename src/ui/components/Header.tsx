import React from 'react'
import { Box, Text } from 'ink'

interface HeaderProps {
  model: string
  mode: 'yolo' | 'safe'
  session?: string
}

export function Header({ model, mode, session }: HeaderProps) {
  return (
    <Box borderStyle="single" paddingX={1}>
      <Text bold color="cyan">Code Agent v0.1.0</Text>
      <Text> | </Text>
      <Text>Model: {model}</Text>
      <Text> | </Text>
      <Text color={mode === 'yolo' ? 'yellow' : 'green'}>
        Mode: {mode.toUpperCase()}
      </Text>
      {session && (
        <>
          <Text> | </Text>
          <Text dimColor>Session: {session.slice(0, 12)}</Text>
        </>
      )}
    </Box>
  )
}
