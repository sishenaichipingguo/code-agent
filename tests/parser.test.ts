import { describe, test, expect } from 'bun:test'
import { parseArgs } from '../src/cli/parser'

describe('CLI Parser', () => {
  test('parses message argument', () => {
    const args = parseArgs(['hello world'])
    expect(args.message).toBe('hello world')
  })

  test('parses mode flag', () => {
    const args = parseArgs(['--mode', 'safe', 'test'])
    expect(args.mode).toBe('safe')
  })

  test('parses model flag', () => {
    const args = parseArgs(['--model', 'claude-opus-4'])
    expect(args.model).toBe('claude-opus-4')
  })

  test('parses verbose flag', () => {
    const args = parseArgs(['--verbose'])
    expect(args.verbose).toBe(true)
  })
})
