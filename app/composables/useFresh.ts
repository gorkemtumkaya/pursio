import { computed, onScopeDispose, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import type { FreshRequest, FreshResponseOk } from '#shared/types/fresh'
import { fetchFresh } from '~/utils/fresh-api'

/** No response within this time is a failure (spec: fresh, Req 16.4). */
export const FRESH_TIMEOUT_MS = 10_000
/** The "Updated" label ticks this often (Req 11.5). */
export const FRESH_TICK_MS = 60_000

export type FreshStatus = 'loading' | 'error' | 'ready'

export interface FreshLoaderDeps {
  /** One request. Must honor the signal; a request that ignores it still times out. */
  load: (signal: AbortSignal) => Promise<FreshResponseOk>
  timeoutMs?: number
  /** Client clock, epoch ms. */
  now?: () => number
  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface FreshLoader {
  status: Readonly<Ref<FreshStatus>>
  response: Readonly<Ref<FreshResponseOk | null>>
  /** True while a request is in flight; "Try again" is disabled then (Req 16.5). */
  pending: Readonly<Ref<boolean>>
  /** Client time when the response arrived, epoch ms. */
  receivedAt: Readonly<Ref<number | null>>
  /** Sends one request unless one is in flight. Resolves when it settles. */
  start(): Promise<void>
  /** "Try again": exactly one new request, none while one is pending (Req 16.5). */
  retry(): Promise<void>
  stop(): void
}

/**
 * Fresh_Endpoint request state (spec: fresh, Req 16.4 to 16.6): `loading` until the first
 * answer, `ready` with the response, or `error` after a failed request, an error response or
 * no response within 10 s. While a request is pending no new one is sent.
 */
export function createFreshLoader(deps: FreshLoaderDeps): FreshLoader {
  const timeoutMs = deps.timeoutMs ?? FRESH_TIMEOUT_MS
  const now = deps.now ?? (() => Date.now())
  const setTimer = deps.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms))
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

  const status = ref<FreshStatus>('loading')
  const response = shallowRef<FreshResponseOk | null>(null)
  const pending = ref(false)
  const receivedAt = ref<number | null>(null)
  let run = 0
  let controller: AbortController | null = null

  async function send(): Promise<void> {
    if (pending.value) return
    const mine = ++run
    pending.value = true
    status.value = 'loading'
    const abort = new AbortController()
    controller = abort
    let timer: unknown = null
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimer(() => {
        abort.abort()
        reject(new Error('timeout'))
      }, timeoutMs)
    })
    try {
      const data = await Promise.race([deps.load(abort.signal), timeout])
      if (mine !== run) return
      response.value = data
      receivedAt.value = now()
      status.value = 'ready'
    } catch {
      if (mine !== run) return
      status.value = 'error'
    } finally {
      clearTimer(timer)
      if (mine === run) {
        pending.value = false
        controller = null
      }
    }
  }

  return {
    status,
    response,
    pending,
    receivedAt,
    start: send,
    retry: send,
    stop() {
      run += 1
      controller?.abort()
      controller = null
      pending.value = false
    },
  }
}

export interface UseFreshOptions {
  /** Builds the body and the token at request time; the token is null signed out and in Demo_Mode. */
  request: () => Promise<{ body: FreshRequest; token: string | null }>
}

/**
 * The Fresh_Page request (spec: fresh, Req 8.2, 8.15, 11.5, 16.4 to 16.6). `nowMs` is the
 * response's db time plus the time passed on the Client since it arrived, refreshed every
 * 60 s, so the "Updated" label ticks without a new request.
 */
export function useFresh(options: UseFreshOptions): FreshLoader & { nowMs: ComputedRef<number | null> } {
  const loader = createFreshLoader({
    load: async (signal) => {
      const { body, token } = await options.request()
      return fetchFresh(body, token, signal)
    },
  })
  const clock = ref(Date.now())
  let tick: ReturnType<typeof setInterval> | null = null
  if (import.meta.client) {
    tick = setInterval(() => {
      clock.value = Date.now()
    }, FRESH_TICK_MS)
  }
  onScopeDispose(() => {
    if (tick !== null) clearInterval(tick)
    loader.stop()
  })
  const nowMs = computed(() => {
    const data = loader.response.value
    const at = loader.receivedAt.value
    if (!data || at === null) return null
    return data.nowMs + Math.max(0, clock.value - at)
  })
  return { ...loader, nowMs }
}
