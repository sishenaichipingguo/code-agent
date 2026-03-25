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

  printSummary() {
    if (this.metrics.size === 0) return

    console.log('\n⚡ Performance:')

    for (const [name, durations] of this.metrics) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length
      const min = Math.min(...durations)
      const max = Math.max(...durations)

      console.log(`  ${name}: ${avg.toFixed(0)}ms (min: ${min.toFixed(0)}ms, max: ${max.toFixed(0)}ms, count: ${durations.length})`)
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
