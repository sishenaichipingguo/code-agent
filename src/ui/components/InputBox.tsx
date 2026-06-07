import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import type { Completion } from '@/core/completion/engine'

interface InputBoxProps {
  onSubmit: (text: string) => void
  disabled?: boolean
  completions?: Completion[]
  onRequestCompletions?: (text: string, cursor: number) => void
}

export function InputBox({ onSubmit, disabled, completions = [], onRequestCompletions }: InputBoxProps) {
  const [value, setValue] = useState('')
  const [selectedCompletion, setSelectedCompletion] = useState(0)
  const [showCompletions, setShowCompletions] = useState(false)

  useInput((input, key) => {
    if (showCompletions && completions.length > 0) {
      if (key.upArrow) {
        setSelectedCompletion(prev => Math.max(0, prev - 1))
        return
      }
      if (key.downArrow) {
        setSelectedCompletion(prev => Math.min(completions.length - 1, prev + 1))
        return
      }
      if (key.return) {
        setValue(completions[selectedCompletion].text)
        setShowCompletions(false)
        return
      }
      if (key.escape) {
        setShowCompletions(false)
        return
      }
    }

    if (key.tab && onRequestCompletions) {
      onRequestCompletions(value, value.length)
      setShowCompletions(true)
      setSelectedCompletion(0)
    }
  })

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSubmit(value)
      setValue('')
      setShowCompletions(false)
    }
  }

  return (
    <Box flexDirection="column">
      {showCompletions && completions.length > 0 && (
        <Box flexDirection="column" paddingX={1} paddingBottom={1}>
          <Box paddingBottom={1}>
            <Text dimColor>Suggestions (↑↓ to select, ⏎ to apply, esc to cancel):</Text>
          </Box>
          {completions.slice(0, 5).map((c, i) => (
            <Box key={i} paddingLeft={1}>
              <Text color={i === selectedCompletion ? 'cyan' : 'gray'}>
                {i === selectedCompletion ? '▸ ' : '  '}
                {c.display}
              </Text>
              {c.description && (
                <Text dimColor> · {c.description}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}
      <Box paddingX={0} paddingY={0}>
        <Text color="cyan" bold>❯ </Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={disabled ? 'Processing...' : 'Type your message...'}
          showCursor={!disabled}
        />
      </Box>
    </Box>
  )
}
