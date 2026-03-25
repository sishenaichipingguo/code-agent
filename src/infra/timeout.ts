export async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(timeoutError || new Error(`Timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ])
}
