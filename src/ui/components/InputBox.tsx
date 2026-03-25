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
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          {completions.slice(0, 5).map((c, i) => (
            <Box key={i} backgroundColor={i === selectedCompletion ? 'blue' : undefined}>
              <Text color={i === selectedCompletion ? 'white' : 'gray'}>
                {c.display}
              </Text>
              {c.description && (
                <Text dimColor> - {c.description}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}
      <Box borderStyle="single" paddingX={1}>
        <Text color="green">&gt; </Text>
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
