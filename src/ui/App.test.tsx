import { describe, test, expect, mock } from 'bun:test'

// Test the handleSubmit logic in isolation (extracted from App component)
// These tests verify the state transition logic without rendering Ink components

interface ToolEvent {
  name: string
  status: 'running' | 'done' | 'error'
  duration?: number
  summary?: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// Simulate the handleSubmit logic from App.tsx
async function simulateHandleSubmit(
  chunks: Array<{ type: string; name?: string; content?: string; error?: string; result?: string; duration?: number }>,
  initialMessages: Message[] = [],
  initialToolEvents: ToolEvent[] = []
): Promise<{ messages: Message[]; toolEvents: ToolEvent[] }> {
  let messages = [...initialMessages]
  let toolEvents = [...initialToolEvents]
  let assistantContent = ''

  // Simulate: clear toolEvents at start of new submission
  toolEvents = []
  // Simulate: setMessages(prev => [...prev, { role: 'user', content: text }])
  messages = [...messages, { role: 'user', content: 'test input' }]

  for (const chunk of chunks) {
    if (chunk.type === 'tool_start') {
      toolEvents = [...toolEvents, { name: chunk.name!, status: 'running' }]
    }
    if (chunk.type === 'tool_end') {
      toolEvents = toolEvents.map(e =>
        e.name === chunk.name && e.status === 'running'
          ? { ...e, status: chunk.error ? 'error' : 'done', duration: chunk.duration, summary: (chunk.error ?? chunk.result!).slice(0, 60) }
          : e
      )
    }
    if (chunk.type === 'text' && chunk.content) {
      assistantContent += chunk.content
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant') {
        messages = [...messages.slice(0, -1), { role: 'assistant', content: assistantContent }]
      } else {
        messages = [...messages, { role: 'assistant', content: assistantContent }]
      }
    }
  }

  return { messages, toolEvents }
}

describe('App handleSubmit logic', () => {
  test('tool events should persist after text chunks arrive', async () => {
    const chunks = [
      { type: 'tool_start', name: 'read_file' },
      { type: 'tool_end', name: 'read_file', result: 'file contents', duration: 100 },
      { type: 'text', content: 'Here is the result' },
    ]

    const { toolEvents } = await simulateHandleSubmit(chunks)

    // Tool events should still be visible after text arrives
    expect(toolEvents.length).toBe(1)
    expect(toolEvents[0].name).toBe('read_file')
    expect(toolEvents[0].status).toBe('done')
  })

  test('tool events should not be cleared mid-stream when more text chunks arrive', async () => {
    const chunks = [
      { type: 'tool_start', name: 'read_file' },
      { type: 'tool_end', name: 'read_file', result: 'file contents', duration: 100 },
      { type: 'text', content: 'First chunk ' },
      { type: 'text', content: 'second chunk' },
    ]

    const { toolEvents } = await simulateHandleSubmit(chunks)

    expect(toolEvents.length).toBe(1)
  })

  test('assistant content accumulates correctly across multiple text chunks', async () => {
    const chunks = [
      { type: 'text', content: 'Hello ' },
      { type: 'text', content: 'world' },
      { type: 'text', content: '!' },
    ]

    const { messages } = await simulateHandleSubmit(chunks)

    const assistantMsg = messages.find(m => m.role === 'assistant')
    expect(assistantMsg?.content).toBe('Hello world!')
  })

  test('only one assistant message is created for streaming response', async () => {
    const chunks = [
      { type: 'text', content: 'chunk1 ' },
      { type: 'text', content: 'chunk2 ' },
      { type: 'text', content: 'chunk3' },
    ]

    const { messages } = await simulateHandleSubmit(chunks)

    const assistantMessages = messages.filter(m => m.role === 'assistant')
    expect(assistantMessages.length).toBe(1)
  })
})
