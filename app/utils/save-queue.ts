export interface SaveQueue<T> {
  /** Writes `value` now when idle, else keeps it as the single waiting value. */
  push(value: T): void
  /** Sends the value kept after a failed write. A no-op when there is none or a write is running. */
  retry(): void
  /** Resolves when nothing is in flight or waiting. Never rejects; a failed write only leaves its value for `retry`. */
  settled(): Promise<void>
  /** Forgets the waiting value and the value kept after a failure. A write already in flight is not aborted. */
  cancel(): void
}

export interface SaveQueueHooks {
  onFailure?: () => void
  onSuccess?: () => void
}

/**
 * Sends writes one at a time (spec: accounts-cloud-save, Req 6.3 to 6.5). While
 * a write runs, only the latest pushed value waits and it is sent next. After a
 * failure the latest value is kept and nothing is sent until `retry()` or the
 * next `push`: a new push is a new user action, not an automatic retry.
 */
export function createSaveQueue<T>(write: (value: T) => Promise<void>, hooks: SaveQueueHooks = {}): SaveQueue<T> {
  let inFlight = false
  let waiting: { value: T } | null = null
  let failed: { value: T } | null = null
  let resolvers: Array<() => void> = []

  function release(): void {
    const done = resolvers
    resolvers = []
    for (const resolve of done) resolve()
  }

  function start(value: T): void {
    inFlight = true
    let pending: Promise<void>
    try {
      pending = write(value)
    } catch (error) {
      pending = Promise.reject(error)
    }
    pending.then(
      () => {
        inFlight = false
        hooks.onSuccess?.()
        const next = waiting
        waiting = null
        if (next) start(next.value)
        else release()
      },
      () => {
        inFlight = false
        failed = waiting ?? { value }
        waiting = null
        hooks.onFailure?.()
        release()
      },
    )
  }

  return {
    push(value) {
      if (inFlight) {
        waiting = { value }
        return
      }
      failed = null
      start(value)
    },
    retry() {
      if (inFlight || !failed) return
      const { value } = failed
      failed = null
      start(value)
    },
    settled() {
      if (!inFlight) return Promise.resolve()
      return new Promise<void>((resolve) => {
        resolvers.push(resolve)
      })
    },
    cancel() {
      waiting = null
      failed = null
    },
  }
}
