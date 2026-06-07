import React from 'react'
import { Box, Text } from 'ink'

export interface ToolEvent {
  name: string
  status: 'running' | 'done' | 'error'
  duration?: number
  summary?: string
}

interface ToolActivityProps {
  events: ToolEvent[]
}

export function ToolActivity({ events }: ToolActivityProps) {
  if (events.length === 0) return null

  return (
    <Box flexDirection="column" paddingX={1}>
      {events.map((e, i) => (
        <Box key={i}>
          {e.status === 'running' && (
            <Text dimColor>⟳ {e.name}</Text>
          )}
          {e.status === 'done' && (
            <Text>
              <Text color="green">✓ </Text>
              <Text>{e.name}</Text>
              {e.duration !== undefined && <Text dimColor> · {e.duration}ms</Text>}
              {e.summary && <Text dimColor> → {e.summary}</Text>}
            </Text>
          )}
          {e.status === 'error' && (
            <Text>
              <Text color="red">✗ </Text>
              <Text>{e.name}</Text>
              {e.duration !== undefined && <Text dimColor> · {e.duration}ms</Text>}
              {e.summary && <Text color="red"> → {e.summary}</Text>}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  )
}
