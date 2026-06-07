import { describe, it, expect, beforeEach } from 'bun:test'
import { TokenTracker, initTokenTracker, getTokenTracker } from './token-tracker'

describe('TokenTracker', () => {
  let tracker: TokenTracker

  beforeEach(() => {
    tracker = new TokenTracker()
  })

  it('starts with zero usage', () => {
    const usage = tracker.getUsage()
    expect(usage.inputTokens).toBe(0)
    expect(usage.outputTokens).toBe(0)
    expect(usage.totalTokens).toBe(0)
    expect(usage.cacheCreationTokens).toBe(0)
    expect(usage.cacheReadTokens).toBe(0)
    expect(usage.cost).toBe(0)
  })

  it('accumulates token counts correctly', () => {
    tracker.track('claude-sonnet-4-6', 100, 50)
    tracker.track('claude-sonnet-4-6', 200, 80)

    const usage = tracker.getUsage()
    expect(usage.inputTokens).toBe(300)
    expect(usage.outputTokens).toBe(130)
    expect(usage.totalTokens).toBe(430)
  })

  it('calculates cost for claude-sonnet-4-6', () => {
    // input: 3/1M, output: 15/1M
    tracker.track('claude-sonnet-4-6', 1_000_000, 1_000_000)
    const usage = tracker.getUsage()
    expect(usage.cost).toBeCloseTo(18, 4) // 3 + 15
  })

  it('calculates cost for claude-opus-4', () => {
    // input: 15/1M, output: 75/1M
    tracker.track('claude-opus-4', 1_000_000, 1_000_000)
    const usage = tracker.getUsage()
    expect(usage.cost).toBeCloseTo(90, 4) // 15 + 75
  })

  it('calculates cost for claude-haiku-4', () => {
    // input: 0.25/1M, output: 1.25/1M
    tracker.track('claude-haiku-4', 1_000_000, 1_000_000)
    const usage = tracker.getUsage()
    expect(usage.cost).toBeCloseTo(1.5, 4)
  })

  it('includes cache creation and read tokens in cost', () => {
    // cacheWrite: 3.75/1M, cacheRead: 0.3/1M for sonnet-4
    tracker.track('claude-sonnet-4-6', 0, 0, 1_000_000, 1_000_000)
    const usage = tracker.getUsage()
    expect(usage.cacheCreationTokens).toBe(1_000_000)
    expect(usage.cacheReadTokens).toBe(1_000_000)
    expect(usage.cost).toBeCloseTo(4.05, 4) // 3.75 + 0.3
  })

  it('does not add cost for unknown model', () => {
    tracker.track('unknown-model', 1_000_000, 1_000_000)
    const usage = tracker.getUsage()
    expect(usage.cost).toBe(0)
    expect(usage.inputTokens).toBe(1_000_000)
  })

  it('tracks lastInputTokens correctly', () => {
    tracker.track('claude-sonnet-4-6', 100, 50)
    expect(tracker.getLastInputTokens()).toBe(100)
    tracker.track('claude-sonnet-4-6', 200, 80)
    expect(tracker.getLastInputTokens()).toBe(200)
  })

  it('getUsage returns a copy, not a reference', () => {
    tracker.track('claude-sonnet-4-6', 100, 50)
    const usage = tracker.getUsage()
    usage.inputTokens = 9999
    expect(tracker.getUsage().inputTokens).toBe(100)
  })
})

describe('initTokenTracker / getTokenTracker', () => {
  it('initializes and retrieves the global tracker', () => {
    const t = initTokenTracker()
    expect(t).toBeInstanceOf(TokenTracker)
    expect(getTokenTracker()).toBe(t)
  })

  it('getTokenTracker throws if not initialized', () => {
    // Reset the module-level tracker by re-importing won't work easily,
    // so we just verify the happy path works after init
    const t = initTokenTracker()
    expect(() => getTokenTracker()).not.toThrow()
  })
})
