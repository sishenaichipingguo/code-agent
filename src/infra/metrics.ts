export interface MetricSummary {
  name: string
  avgMs: number
  minMs: number
  maxMs: number
  count: number
}

export class PerformanceMetrics {
  private metrics = new Map<string, number[]>()

  measure<T>(name: string, fn: () => T | Promise<T>): T | Promise<T> {
    const start = performance.now()

    const result = fn()

    if (result instanceof Promise) {
      return result.finally(() => {
        const duration = performance.now() - start
        this.record(name, duration)
      }) as T
    }

    const duration = performance.now() - start
    this.record(name, duration)
    return result
  }

  private record(name: string, duration: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }
    this.metrics.get(name)!.push(duration)
  }

  // Immutable view of collected timings, reused by printSummary and by the
  // usage log sink so both render the same numbers.
  snapshot(): MetricSummary[] {
    const summaries: MetricSummary[] = []
    for (const [name, durations] of this.metrics) {
      if (durations.length === 0) continue
      const sum = durations.reduce((a, b) => a + b, 0)
      summaries.push({
        name,
        avgMs: sum / durations.length,
        minMs: Math.min(...durations),
        maxMs: Math.max(...durations),
        count: durations.length,
      })
    }
    return summaries
  }

  printSummary() {
    const summaries = this.snapshot()
    if (summaries.length === 0) return

    console.log('\n⚡ Performance:')

    for (const s of summaries) {
      console.log(
        `  ${s.name}: ${s.avgMs.toFixed(0)}ms (min: ${s.minMs.toFixed(0)}ms, max: ${s.maxMs.toFixed(0)}ms, count: ${s.count})`
      )
    }
  }
}

let metrics: PerformanceMetrics | null = null

export function initMetrics(): PerformanceMetrics {
  metrics = new PerformanceMetrics()
  return metrics
}

export function getMetrics(): PerformanceMetrics {
  if (!metrics) {
    throw new Error('Metrics not initialized')
  }
  return metrics
}
