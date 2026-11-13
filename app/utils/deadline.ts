/** Thrown by `raceDeadline` when the time limit passes first. */
export class DeadlineError extends Error {
  constructor() {
    super('deadline')
    this.name = 'DeadlineError'
  }
}

/**
 * Settles like `promise`, or rejects with a `DeadlineError` after `ms`. The
 * promise itself is not cancelled; pass an abort signal to the work for that.
 */
export function raceDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}
