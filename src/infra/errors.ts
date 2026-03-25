// Enhanced error handling system

export enum ErrorCode {
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  API_ERROR = 'API_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  INVALID_INPUT = 'INVALID_INPUT',
  TIMEOUT = 'TIMEOUT',
}

export class AgentError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, any>,
    public recoverable: boolean = false
  ) {
    super(message)
    this.name = 'AgentError'
  }

  toUserMessage(): string {
    const messages: Record<ErrorCode, string> = {
      [ErrorCode.TOOL_NOT_FOUND]: `Tool "${this.details?.tool}" not found. Available: bash, read, write, edit, glob, grep`,
      [ErrorCode.PERMISSION_DENIED]: `Permission denied for ${this.details?.tool}. Use --mode safe to approve.`,
      [ErrorCode.API_ERROR]: `API error: ${this.message}. Check your API key.`,
      [ErrorCode.NETWORK_ERROR]: `Network error: ${this.message}. Check connection.`,
      [ErrorCode.RATE_LIMIT]: `Rate limit exceeded. Wait ${this.details?.retryAfter || 60}s.`,
      [ErrorCode.INVALID_INPUT]: `Invalid input: ${this.message}`,
      [ErrorCode.TOOL_EXECUTION_FAILED]: `Tool failed: ${this.message}`,
      [ErrorCode.TIMEOUT]: `Operation timed out: ${this.message}`,
    }
    return messages[this.code] || this.message
  }

  getSuggestion(): string | null {
    const suggestions: Partial<Record<ErrorCode, string>> = {
      [ErrorCode.API_ERROR]: 'Check ANTHROPIC_API_KEY in .env',
      [ErrorCode.NETWORK_ERROR]: 'Verify internet connection',
      [ErrorCode.RATE_LIMIT]: 'Wait and try again',
      [ErrorCode.PERMISSION_DENIED]: 'Use --mode safe',
    }
    return suggestions[this.code] || null
  }
}

export interface RetryOptions {
  maxRetries?: number
  backoff?: number
  retryableErrors?: ErrorCode[]
  onRetry?: (attempt: number, error: any) => void
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    backoff = 1000,
    retryableErrors = [ErrorCode.NETWORK_ERROR, ErrorCode.RATE_LIMIT, ErrorCode.API_ERROR],
    onRetry
  } = options

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isRetryable = error instanceof AgentError &&
        retryableErrors.includes(error.code)

      if (!isRetryable || attempt === maxRetries - 1) {
        throw error
      }

      if (onRetry) {
        onRetry(attempt + 1, error)
      }

      const delay = backoff * Math.pow(2, attempt)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw new Error('Unreachable')
}
