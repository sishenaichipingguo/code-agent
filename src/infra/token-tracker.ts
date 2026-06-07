export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  cost: number
}

export class TokenTracker {
  private usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    cost: 0
  }
  private lastInputTokens = 0

  private pricing: Record<string, { input: number; output: number; cacheWrite: number; cacheRead: number }> = {
    'claude-opus-4':    { input: 15 / 1_000_000, output: 75 / 1_000_000, cacheWrite: 18.75 / 1_000_000, cacheRead: 1.5 / 1_000_000 },
    'claude-sonnet-4-6':  { input: 3 / 1_000_000,  output: 15 / 1_000_000, cacheWrite: 3.75 / 1_000_000,  cacheRead: 0.3 / 1_000_000 },
    'claude-haiku-4':   { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000, cacheWrite: 0.3 / 1_000_000, cacheRead: 0.03 / 1_000_000 },
  }

  track(model: string, input: number, output: number, cacheCreation = 0, cacheRead = 0) {
    this.usage.inputTokens += input
    this.usage.outputTokens += output
    this.usage.totalTokens += input + output
    this.usage.cacheCreationTokens += cacheCreation
    this.usage.cacheReadTokens += cacheRead
    this.lastInputTokens = input

    const price = this.pricing[model]
    if (price) {
      this.usage.cost +=
        input * price.input +
        output * price.output +
        cacheCreation * price.cacheWrite +
        cacheRead * price.cacheRead
    }
  }

  getUsage(): TokenUsage {
    return { ...this.usage }
  }

  getLastInputTokens(): number {
    return this.lastInputTokens
  }

  printSummary() {
    const { inputTokens, outputTokens, totalTokens, cacheCreationTokens, cacheReadTokens, cost } = this.usage
    const cacheHitRate = inputTokens > 0
      ? ((cacheReadTokens / (inputTokens + cacheReadTokens)) * 100).toFixed(1)
      : '0.0'

    process.stderr.write(`
💰 Token Usage:
  Input:         ${inputTokens.toLocaleString()} tokens
  Output:        ${outputTokens.toLocaleString()} tokens
  Total:         ${totalTokens.toLocaleString()} tokens
  Cache write:   ${cacheCreationTokens.toLocaleString()} tokens
  Cache read:    ${cacheReadTokens.toLocaleString()} tokens (${cacheHitRate}% hit rate)
  Cost:          $${cost.toFixed(4)}
`)
  }
}

let tracker: TokenTracker | null = null

export function initTokenTracker(): TokenTracker {
  tracker = new TokenTracker()
  return tracker
}

export function getTokenTracker(): TokenTracker {
  if (!tracker) {
    throw new Error('TokenTracker not initialized')
  }
  return tracker
}
