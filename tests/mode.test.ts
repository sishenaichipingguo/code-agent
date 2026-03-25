import { describe, test, expect } from 'bun:test'
import { detectMode } from '../src/cli/mode'

describe('Mode Detection', () => {
  test('defaults to yolo', () => {
    const mode = detectMode({})
    expect(mode).toBe('yolo')
  })

  test('respects CLI argument', () => {
    const mode = detectMode({ mode: 'safe' })
    expect(mode).toBe('safe')
  })

  test('CLI argument overrides env', () => {
    process.env.AGENT_MODE = 'safe'
    const mode = detectMode({ mode: 'yolo' })
    expect(mode).toBe('yolo')
    delete process.env.AGENT_MODE
  })
})
