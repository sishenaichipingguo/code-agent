// Performance metrics collector
interface Metric {
  name: string
  value: number
  tags?: Record<string, string>
  timestamp: number
}

class MetricsCollector {
  private metrics: Metric[] = []

  counter(name: string, value = 1, tags?: Record<string, string>) {
    this.metrics.push({
      name,
      value,
      tags,
      timestamp: Date.now()
    })
  }

  async timer<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now()
    try {
      return await fn()
    } finally {
      const duration = performance.now() - start
      this.counter(name + '.duration', duration)
    }
  }

  export(): Metric[] {
    return [...this.metrics]
  }

  clear() {
    this.metrics = []
  }
}

export const metrics = new MetricsCollector()
