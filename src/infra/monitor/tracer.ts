// Distributed tracing support
interface Span {
  id: string
  name: string
  startTime: number
  endTime?: number
  duration?: number
  parent?: string
}

class Tracer {
  private spans = new Map<string, Span>()
  private counter = 0

  startSpan(name: string, parent?: string): string {
    const id = `span_${++this.counter}`
    this.spans.set(id, {
      id,
      name,
      parent,
      startTime: performance.now()
    })
    return id
  }

  endSpan(id: string) {
    const span = this.spans.get(id)
    if (!span) return

    span.endTime = performance.now()
    span.duration = span.endTime - span.startTime
  }

  getSpan(id: string): Span | undefined {
    return this.spans.get(id)
  }
}

export const tracer = new Tracer()
