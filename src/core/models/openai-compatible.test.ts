import { describe, it, expect, beforeAll, afterEach } from 'bun:test'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initLogger } from '@/infra/logger'
import { initTokenTracker } from '@/infra/token-tracker'
import { OpenAICompatibleAdapter } from './openai-compatible'

// Minimal tool registry stub matching the .toSchema() contract the adapter uses.
const toolRegistry = {
  toSchema: () => [
    {
      name: 'read',
      description: 'Read a file',
      input_schema: { type: 'object' },
    },
  ],
}

const realFetch = globalThis.fetch
let lastRequest: { url: string; init: any }

function mockFetchJson(payload: unknown, ok = true, status = 200) {
  globalThis.fetch = (async (url: any, init: any) => {
    lastRequest = { url: String(url), init }
    return {
      ok,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as any
  }) as any
}

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
}

function mockFetchStream(chunks: string[]) {
  globalThis.fetch = (async (url: any, init: any) => {
    lastRequest = { url: String(url), init }
    return { ok: true, status: 200, body: sseStream(chunks) } as any
  }) as any
}

function makeAdapter() {
  return new OpenAICompatibleAdapter({
    apiKey: 'test-key',
    model: 'gpt-test',
    baseUrl: 'http://localhost:1234/v1',
  })
}

describe('OpenAICompatibleAdapter', () => {
  beforeAll(() => {
    initLogger({
      level: 'error',
      file: join(mkdtempSync(join(tmpdir(), 'oai-')), 'a.log'),
    })
    initTokenTracker()
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('parses a plain text completion', async () => {
    mockFetchJson({
      choices: [{ message: { content: 'hello there' } }],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    })

    const res = await makeAdapter().chat(
      { model: 'gpt-test', messages: [{ role: 'user', content: 'hi' }] },
      toolRegistry
    )

    expect(res.type).toBe('text')
    expect(res.content).toBe('hello there')
    expect(res.inputTokens).toBe(10)
  })

  it('parses a tool call and normalizes it to tool_use blocks', async () => {
    mockFetchJson({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'read', arguments: '{"path":"a.txt"}' },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    })

    const res = await makeAdapter().chat(
      {
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'read a.txt' }],
      },
      toolRegistry
    )

    expect(res.type).toBe('tool_use')
    expect(res.tools).toHaveLength(1)
    expect(res.tools![0]).toMatchObject({
      type: 'tool_use',
      id: 'call_1',
      name: 'read',
      input: { path: 'a.txt' },
    })
  })

  it('sends auth header, OpenAI tool schema, and a system message', async () => {
    mockFetchJson({ choices: [{ message: { content: 'ok' } }] })

    await makeAdapter().chat(
      {
        model: 'gpt-test',
        messages: [{ role: 'user', content: 'hi' }],
        system: 'CUSTOM SYSTEM',
      },
      toolRegistry
    )

    expect(lastRequest.url).toBe('http://localhost:1234/v1/chat/completions')
    expect(lastRequest.init.headers['Authorization']).toBe('Bearer test-key')
    const body = JSON.parse(lastRequest.init.body)
    expect(body.messages[0]).toEqual({
      role: 'system',
      content: 'CUSTOM SYSTEM',
    })
    expect(body.tools[0]).toEqual({
      type: 'function',
      function: {
        name: 'read',
        description: 'Read a file',
        parameters: { type: 'object' },
      },
    })
  })

  it('converts tool_use history and tool_result into OpenAI roles', async () => {
    mockFetchJson({ choices: [{ message: { content: 'done' } }] })

    await makeAdapter().chat(
      {
        model: 'gpt-test',
        messages: [
          { role: 'user', content: 'read a.txt' },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call_9',
                name: 'read',
                input: { path: 'a.txt' },
              },
            ] as any,
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'call_9',
                content: 'file body',
              },
            ] as any,
          },
        ],
      },
      toolRegistry
    )

    const body = JSON.parse(lastRequest.init.body)
    // [0] system, [1] user, [2] assistant w/ tool_calls, [3] tool result
    const assistant = body.messages[2]
    expect(assistant.role).toBe('assistant')
    expect(assistant.tool_calls[0]).toEqual({
      id: 'call_9',
      type: 'function',
      function: { name: 'read', arguments: '{"path":"a.txt"}' },
    })
    const toolMsg = body.messages[3]
    expect(toolMsg).toEqual({
      role: 'tool',
      tool_call_id: 'call_9',
      content: 'file body',
    })
  })

  it('returns an error response on non-ok status instead of throwing', async () => {
    mockFetchJson({ error: 'bad model' }, false, 400)

    const res = await makeAdapter().chat(
      { model: 'gpt-test', messages: [{ role: 'user', content: 'hi' }] },
      toolRegistry
    )

    expect(res.type).toBe('error')
    expect(res.error).toContain('400')
  })

  it('assembles fragmented streaming tool_calls and yields a done chunk', async () => {
    mockFetchStream([
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read","arguments":"{\\"path\\":"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"a.txt\\"}"}}]}}]}\n\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":7,"completion_tokens":2}}\n\n',
      'data: [DONE]\n\n',
    ])

    const chunks: any[] = []
    for await (const c of makeAdapter().chatStream!(
      { model: 'gpt-test', messages: [{ role: 'user', content: 'go' }] },
      toolRegistry
    )) {
      chunks.push(c)
    }

    expect(chunks.find(c => c.type === 'text')?.content).toBe('Hi')
    const toolChunk = chunks.find(c => c.type === 'tool_use')
    expect(toolChunk.tool).toMatchObject({
      id: 'call_1',
      name: 'read',
      input: { path: 'a.txt' },
    })
    expect(toolChunk.toolIndex).toBe(0)
    const done = chunks.find(c => c.type === 'done')
    expect(done.inputTokens).toBe(7)
  })
})
