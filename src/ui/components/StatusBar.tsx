import React from 'react'
import { Box, Text } from 'ink'

interface StatusBarProps {
  tokens?: { input: number; output: number; cost: number }
  performance?: { duration: number }
}

export function StatusBar({ tokens, performance }: StatusBarProps) {
  return (
    <Box borderStyle="single" paddingX={1}>
      {tokens && (
        <>
          <Text>Tokens: {tokens.input + tokens.output}</Text>
          <Text> | </Text>
          <Text>Cost: ${tokens.cost.toFixed(4)}</Text>
        </>
      )}
      {performance && (
        <>
          <Text> | </Text>
          <Text>Time: {performance.duration.toFixed(1)}s</Text>
        </>
      )}
      {!tokens && !performance && (
        <Text dimColor>Ready</Text>
      )}
    </Box>
  )
}
