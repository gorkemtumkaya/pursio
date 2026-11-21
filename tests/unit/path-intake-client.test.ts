import { describe, expect, it } from 'vitest'
import { emptySettings } from '../../app/utils/llm-settings'
import { INTAKE_TIMEOUT_MS, buildIntakeRequest, runIntake, type IntakeClientDeps } from '../../app/utils/intake-client'

const PROFILE = {
  level: null,
  goal: null,
  avoid: [],
  taste: [],
  goalOptions: [
    { id: 'a', label: 'A', finishLine: 'Finish A' },
    { id: 'b', label: 'B', finishLine: 'Finish B' },
  ],
  knownOptions: [],
  tasteOptions: [],
  mascotSet: 'guitar',
}

/** A fake clock: timers run only when `fire` is called. */
function fakeTimers() {
  const pending = new Map<number, { run: () => void; ms: number }>()
  let next = 0
  const deps: Pick<IntakeClientDeps, 'setTimer' | 'clearTimer'> = {
    setTimer: (run, ms) => {
      next += 1
      pending.set(next, { run, ms })
      return next
    },
    clearTimer: (handle) => {
      pending.delete(handle as number)
    },
  }
  return {
    deps,
    pending,
    fire: () => {
      for (const timer of pending.values()) timer.run()
    },
  }
}

const request = buildIntakeRequest('guitar', '', 'en', emptySettings())

describe('buildIntakeRequest (Req 3.1)', () => {
  it('sends the trimmed hobby and Note and the language; the own key only with its provider', () => {
    expect(buildIntakeRequest(' guitar ', ' hi ', 'tr', emptySettings())).toEqual({
      body: { hobby: 'guitar', note: 'hi', language: 'tr' },
      headers: {},
    })
    const own = buildIntakeRequest('guitar', '', 'en', { ...emptySettings(), apiKey: 'own-key-placeholder', provider: 'openai' })
    expect(own.body.provider).toBe('openai')
    expect(Object.values(own.headers)).toEqual(['own-key-placeholder'])
  })
})

describe('runIntake (Req 3.4 to 3.7)', () => {
  it('opens the Panel with a body the Sanitizer accepts, and clears its timer', async () => {
    const timers = fakeTimers()
    const outcome = await runIntake(request, { ...timers.deps, fetch: async () => ({ profile: PROFILE }) })
    expect(outcome).toEqual({ kind: 'profile', profile: PROFILE })
    expect(timers.pending.size).toBe(0)
  })

  it('treats every error, a broken body and a missing profile as a failure, and never throws', async () => {
    const answers: (() => Promise<unknown>)[] = [
      () => Promise.reject(new Error('502')),
      () => Promise.reject(new TypeError('offline')),
      async () => ({ profile: { ...PROFILE, goalOptions: [] } }),
      async () => ({ error: 'rate_limited' }),
      async () => null,
      async () => 'text',
    ]
    for (const answer of answers) {
      const timers = fakeTimers()
      await expect(runIntake(request, { ...timers.deps, fetch: answer })).resolves.toEqual({ kind: 'failure' })
    }
  })

  it('aborts the request after 5000 ms', async () => {
    const timers = fakeTimers()
    let seen: AbortSignal | undefined
    const pendingCall = runIntake(request, {
      ...timers.deps,
      fetch: (_request, signal) => {
        seen = signal
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
      },
    })
    expect([...timers.pending.values()].map((timer) => timer.ms)).toEqual([INTAKE_TIMEOUT_MS])
    timers.fire()
    await expect(pendingCall).resolves.toEqual({ kind: 'failure' })
    expect(seen?.aborted).toBe(true)
  })

  it('stops when the page goes away, and sends nothing when it is already gone', async () => {
    const leaving = new AbortController()
    const call = runIntake(request, {
      ...fakeTimers().deps,
      signal: leaving.signal,
      fetch: (_request, signal) =>
        new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('gone')))),
    })
    leaving.abort()
    await expect(call).resolves.toEqual({ kind: 'failure' })
    let called = false
    await runIntake(request, {
      ...fakeTimers().deps,
      signal: leaving.signal,
      fetch: async () => {
        called = true
      },
    })
    expect(called).toBe(false)
  })
})
