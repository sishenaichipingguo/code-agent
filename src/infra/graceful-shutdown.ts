export class GracefulShutdown {
  private handlers: Array<() => Promise<void>> = []
  private isShuttingDown = false

  constructor() {
    this.setupSignalHandlers()
  }

  onShutdown(handler: () => Promise<void>) {
    this.handlers.push(handler)
  }

  private setupSignalHandlers() {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']

    signals.forEach(signal => {
      process.on(signal, async () => {
        if (this.isShuttingDown) {
          console.log('\n⚠️  Force quit...')
          process.exit(1)
        }

        this.isShuttingDown = true
        console.log('\n\n🛑 Shutting down gracefully...')

        try {
          await Promise.all(
            this.handlers.map(handler =>
              handler().catch(err =>
                console.error('Shutdown handler failed:', err)
              )
            )
          )

          console.log('✓ Cleanup complete')
          process.exit(0)
        } catch (error) {
          console.error('✗ Shutdown failed:', error)
          process.exit(1)
        }
      })
    })
  }
}
