export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
}

export class TokenTracker {
  private usage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cost: 0
  }

  private pricing: Record<string, { input: number; output: number }> = {
    'claude-opus-4': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-sonnet-4': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-haiku-4': { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 }
  }

  track(model: string, input: number, output: number) {
    this.usage.inputTokens += input
    this.usage.outputTokens += output
    this.usage.totalTokens += input + output

    const price = this.pricing[model]
    if (price) {
      this.usage.cost += input * price.input + output * price.output
    }
  }

  getUsage(): TokenUsage {
    return { ...this.usage }
  }

  printSummary() {
    console.log(`
💰 Token Usage:
  Input:  ${this.usage.inputTokens.toLocaleString()} tokens
  Output: ${this.usage.outputTokens.toLocaleString()} tokens
  Total:  ${this.usage.totalTokens.toLocaleString()} tokens
  Cost:   $${this.usage.cost.toFixed(4)}
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
