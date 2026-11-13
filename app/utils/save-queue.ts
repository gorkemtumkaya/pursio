export interface SaveQueue<T> {
  /** Writes `value` now when idle, else keeps it as the single waiting value. */
  push(value: T): void
  /** Sends the value kept after a failed write. A no-op when there is none or a write is running. */
  retry(): void
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
      },
      () => {
        inFlight = false
        failed = waiting ?? { value }
        waiting = null
        hooks.onFailure?.()
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
  }
}
