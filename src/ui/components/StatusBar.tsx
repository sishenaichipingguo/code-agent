import React from 'react'
import { Box, Text } from 'ink'

interface StatusBarProps {
  tokens?: { input: number; output: number; cost: number }
  performance?: { duration: number }
}

export function StatusBar({ tokens, performance }: StatusBarProps) {
  return (
    <Box flexDirection="column" paddingTop={1}>
      <Box>
        <Text dimColor>{'─'.repeat(80)}</Text>
      </Box>
      <Box paddingY={0}>
        {tokens && (
          <>
            <Text dimColor>Tokens: </Text>
            <Text>{tokens.input + tokens.output}</Text>
            <Text dimColor> · Cost: </Text>
            <Text>${tokens.cost.toFixed(4)}</Text>
          </>
        )}
        {performance && (
          <>
            <Text dimColor> · </Text>
            <Text dimColor>Time: </Text>
            <Text>{performance.duration.toFixed(1)}s</Text>
          </>
        )}
        {!tokens && !performance && (
          <Text dimColor>✓ Ready</Text>
        )}
      </Box>
    </Box>
  )
}
