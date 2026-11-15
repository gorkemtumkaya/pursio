// Fakes for the Fresh tests (spec: fresh, task 5.5, Req 19.16).
// No network: the feed fetcher answers only the fixed Channel_Feed URL from a script,
// and the clock and deadline timer are driven by the test.
import type { FeedEntry } from '../../shared/types/fresh'
import { FEED_MAX_BYTES } from '../../server/utils/fresh/feed-fetch'
import type { FreshItemRow } from '../../server/utils/fresh/check-store'
import { InMemoryFreshStore } from '../../server/utils/fresh/check-store-memory'
import type { FreshJudgeOutput } from '../../server/utils/fresh/fresh-judge'
import { InMemoryPipelineStore } from '../../server/utils/video/pipeline-store-memory'
import { printChannelFeed } from './feed-printer'
import { SENTINEL_API_KEY, createFakeJudge, type FakeJudge, type JudgeScript } from './video-fakes'

// ---------------------------------------------------------------------------
// FakeClock and the fake deadline timer
// ---------------------------------------------------------------------------

/** 2026-11-08T09:00:00Z, the default start of the fake clock. */
export const FAKE_CLOCK_START_MS = Date.UTC(2026, 10, 8, 9, 0, 0)

export interface FakeClock {
  /** Current fake time in epoch ms. */
  now(): number
  /** Moves the clock forward and fires every timer that is due, in time order. */
  advance(ms: number): void
  /** A signal that aborts with a `TimeoutError` once the clock reaches `atMs`. */
  signalAt(atMs: number): AbortSignal
  /**
   * Fake timer with the shape of `AbortSignal.timeout`: aborts `ms` after the current
   * fake time. Pass it as `timer` to `fetchChannelFeed`, or use it for the Call_Deadline.
   */
  readonly timer: (ms: number) => AbortSignal
  /** Timers that have not fired yet. */
  readonly pendingTimers: number
}

interface ClockTimer {
  atMs: number
  controller: AbortController
}

function timeoutError(): DOMException {
  return new DOMException('The operation timed out.', 'TimeoutError')
}

export function createFakeClock(startMs = FAKE_CLOCK_START_MS): FakeClock {
  let nowMs = startMs
  let timers: ClockTimer[] = []

  const fireDue = (): void => {
    const due = timers.filter((t) => t.atMs <= nowMs).sort((a, b) => a.atMs - b.atMs)
    timers = timers.filter((t) => t.atMs > nowMs)
    for (const t of due) t.controller.abort(timeoutError())
  }

  const signalAt = (atMs: number): AbortSignal => {
    const controller = new AbortController()
    timers.push({ atMs, controller })
    fireDue()
    return controller.signal
  }

  return {
    now: () => nowMs,
    advance(ms) {
      if (!(ms >= 0)) throw new RangeError('advance needs a non-negative number of ms')
      nowMs += ms
      fireDue()
    },
    signalAt,
    timer: (ms) => signalAt(nowMs + ms),
    get pendingTimers() {
      return timers.length
    },
  }
}

// ---------------------------------------------------------------------------
// FakeFeedFetcher
// ---------------------------------------------------------------------------

const FEED_HOST = 'www.youtube.com'
const FEED_PATH = '/feeds/videos.xml'
const CHUNK_BYTES = 16_384
/** A "streamed" oversized body stops here, so a reader that never cancels still ends. */
const STREAMED_OVERSIZE_BYTES = 4 * FEED_MAX_BYTES

/** What one feed request answers. */
export type FeedAnswer =
  /** 200 with a printed Atom feed of these entries. */
  | { entries: readonly FeedEntry[] }
  /** A raw body, 200 unless `status` is given. */
  | { body: string; status?: number }
  /** A status with an optional body, e.g. 404 or 500. */
  | { status: number; body?: string }
  /**
   * A body of more than 1 MB. `declared`: `content-length` says so. `streamed`: no
   * `content-length`, and the bytes keep coming until the reader cancels.
   */
  | { oversize: 'declared' | 'streamed' }
  /** The connection fails: the fetch rejects with a `TypeError`. */
  | { fail: 'connect' }
  /** No response until the request signal aborts. */
  | { hang: true }
  /** 200 headers at once, then a body that never ends until the request signal aborts. */
  | { stall: true }

export type FeedScript = FeedAnswer & {
  /** Real ms to wait before answering. Without it the fake still yields one macrotask, so calls overlap. */
  delayMs?: number
  /** Fake clock ms to advance inside the call, after the wait (needs `clock`). */
  advanceMs?: number
  /** `content-length` to send: a number (may lie), or null for none. Default: the real byte length. */
  contentLength?: number | null
}

export interface FeedRequest {
  url: string
  /** The `channel_id` query value, decoded; null when missing. */
  channelId: string | null
  method: string
  headerNames: string[]
}

export interface FakeFeedFetcherOptions {
  /** Answer per channel id. A list is taken in call order and its last entry is reused. */
  feeds?: Record<string, FeedScript | FeedScript[]>
  /** Answer for a channel id with no script. Default: an empty valid feed. */
  defaultFeed?: FeedScript
  /** Fake clock that `advanceMs` moves. */
  clock?: FakeClock
}

export interface FakeFeedFetcher {
  /** The `typeof fetch` dependency. Answers only the fixed Channel_Feed URL. */
  readonly fetch: typeof fetch
  /** Every feed request, in call order. */
  readonly calls: FeedRequest[]
  /** URLs that were not the Channel_Feed URL; each was refused. */
  readonly unexpectedUrls: string[]
  /** Requests started and not yet finished (body fully read, cancelled, errored or refused). */
  readonly inFlight: number
  /** Highest `inFlight` seen. */
  readonly peakInFlight: number
  /** True when any request had a query parameter other than `channel_id`, a key-like header, or the sentinel key. */
  readonly keySeen: boolean
  /** Bodies the reader cancelled before the end. */
  readonly cancelledBodies: number
  /** Bytes handed to readers, over all bodies. */
  readonly bytesServed: number
  /** Replaces the answer for one channel id. */
  script(channelId: string, answer: FeedScript | FeedScript[]): void
}

const KEY_HEADER_RE = /key|token|auth/i

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('This operation was aborted', 'AbortError')
}

/** Waits `ms` real ms (or one macrotask when 0), rejecting early when the signal aborts. */
function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal))
      return
    }
    const onAbort = (): void => {
      clearTimeout(handle)
      if (signal) reject(abortReason(signal))
    }
    const handle = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function requestHeaders(input: string | URL | Request, init: RequestInit | undefined): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value))
  return headers
}

export function createFakeFeedFetcher(options: FakeFeedFetcherOptions = {}): FakeFeedFetcher {
  const scripts = new Map<string, FeedScript[]>()
  for (const [id, answer] of Object.entries(options.feeds ?? {})) scripts.set(id, Array.isArray(answer) ? [...answer] : [answer])
  const defaultFeed: FeedScript = options.defaultFeed ?? { entries: [] }
  const encoder = new TextEncoder()
  const calls: FeedRequest[] = []
  const unexpectedUrls: string[] = []
  let inFlight = 0
  let peakInFlight = 0
  let keySeen = false
  let cancelledBodies = 0
  let bytesServed = 0

  const nextScript = (channelId: string | null): FeedScript => {
    const list = channelId === null ? undefined : scripts.get(channelId)
    if (!list || list.length === 0) return defaultFeed
    return list.length > 1 ? (list.shift() as FeedScript) : (list[0] as FeedScript)
  }

  /**
   * A body stream that serves `size` bytes from `chunkAt`, honors the request signal and
   * calls `done` once when it closes, errors or is cancelled. `size` Infinity never ends.
   */
  const bodyStream = (
    size: number,
    chunkAt: (offset: number, length: number) => Uint8Array,
    signal: AbortSignal | undefined,
    done: () => void,
    stall = false,
  ): ReadableStream<Uint8Array> => {
    let offset = 0
    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      done()
    }
    return new ReadableStream<Uint8Array>({
      start(controller) {
        signal?.addEventListener(
          'abort',
          () => {
            if (finished) return
            controller.error(abortReason(signal))
            finish()
          },
          { once: true },
        )
      },
      async pull(controller) {
        if (finished) return
        if (signal?.aborted) {
          controller.error(abortReason(signal))
          finish()
          return
        }
        if (stall) return new Promise<void>(() => {})
        if (offset >= size) {
          controller.close()
          finish()
          return
        }
        const length = Math.min(CHUNK_BYTES, size - offset)
        controller.enqueue(chunkAt(offset, length))
        offset += length
        bytesServed += length
      },
      cancel() {
        if (!finished) cancelledBodies += 1
        finish()
      },
    }, { highWaterMark: 0 })
  }

  const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = requestUrl(input)
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined) ?? undefined
    const headers = requestHeaders(input, init)
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      unexpectedUrls.push(url)
      throw new TypeError('fetch failed')
    }
    if (url.includes(SENTINEL_API_KEY)) keySeen = true
    headers.forEach((value, name) => {
      if (KEY_HEADER_RE.test(name) || value.includes(SENTINEL_API_KEY)) keySeen = true
    })
    if (parsed.protocol !== 'https:' || parsed.host !== FEED_HOST || parsed.pathname !== FEED_PATH) {
      unexpectedUrls.push(url)
      throw new TypeError('fetch failed')
    }
    for (const name of parsed.searchParams.keys()) if (name !== 'channel_id') keySeen = true
    const channelId = parsed.searchParams.get('channel_id')
    const headerNames: string[] = []
    headers.forEach((_value, name) => headerNames.push(name))
    calls.push({ url, channelId, method: (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(), headerNames })

    inFlight += 1
    peakInFlight = Math.max(peakInFlight, inFlight)
    let open = true
    const done = (): void => {
      if (!open) return
      open = false
      inFlight -= 1
    }

    try {
      const script = nextScript(channelId)
      await wait(script.delayMs ?? 0, signal)
      if (script.advanceMs !== undefined) options.clock?.advance(script.advanceMs)
      if (signal?.aborted) throw abortReason(signal)

      if ('fail' in script) throw new TypeError('fetch failed')
      if ('hang' in script) {
        return await new Promise<never>((_resolve, reject) => {
          if (signal?.aborted) reject(abortReason(signal))
          else signal?.addEventListener('abort', () => reject(abortReason(signal)), { once: true })
        })
      }

      const responseHeaders = new Headers({ 'content-type': 'application/atom+xml; charset=UTF-8' })
      const setLength = (real: number): void => {
        const length = script.contentLength === undefined ? real : script.contentLength
        if (length !== null) responseHeaders.set('content-length', String(length))
      }

      if ('stall' in script) {
        if (typeof script.contentLength === 'number') responseHeaders.set('content-length', String(script.contentLength))
        return new Response(bodyStream(Number.POSITIVE_INFINITY, () => new Uint8Array(0), signal, done, true), {
          status: 200,
          headers: responseHeaders,
        })
      }

      if ('oversize' in script) {
        const size = script.oversize === 'declared' ? FEED_MAX_BYTES + 1 : STREAMED_OVERSIZE_BYTES
        if (script.oversize === 'declared') setLength(size)
        else if (script.contentLength !== undefined && script.contentLength !== null) responseHeaders.set('content-length', String(script.contentLength))
        const filler = (_offset: number, length: number): Uint8Array => new Uint8Array(length).fill(0x20)
        return new Response(bodyStream(size, filler, signal, done), { status: 200, headers: responseHeaders })
      }

      const status = 'entries' in script ? 200 : (script.status ?? 200)
      const text = 'entries' in script ? printChannelFeed(script.entries) : (script.body ?? '')
      const bytes = encoder.encode(text)
      if ([101, 103, 204, 205, 304].includes(status)) {
        done()
        return new Response(null, { status, headers: responseHeaders })
      }
      setLength(bytes.byteLength)
      return new Response(bodyStream(bytes.byteLength, (offset, length) => bytes.slice(offset, offset + length), signal, done), {
        status,
        headers: responseHeaders,
      })
    } catch (error) {
      done()
      throw error
    }
  }

  return {
    fetch: fetcher as typeof fetch,
    calls,
    unexpectedUrls,
    get inFlight() {
      return inFlight
    },
    get peakInFlight() {
      return peakInFlight
    },
    get keySeen() {
      return keySeen
    },
    get cancelledBodies() {
      return cancelledBodies
    },
    get bytesServed() {
      return bytesServed
    },
    script(channelId, answer) {
      scripts.set(channelId, Array.isArray(answer) ? [...answer] : [answer])
    },
  }
}

// ---------------------------------------------------------------------------
// Scripted Fresh verdicts (task 9.1)
// ---------------------------------------------------------------------------

export type FreshVerdict = FreshJudgeOutput['verdicts'][number]

/**
 * A verdict that `applyFreshVerdicts` keeps when `skillTitle` is one of the given titles:
 * instruction, `teaches_this_skill` 0.9, a short why that quotes nothing.
 */
export function freshVerdict(videoId: string, skillTitle: string | null, overrides: Partial<FreshVerdict> = {}): FreshVerdict {
  return {
    video_id: videoId,
    skill_title: skillTitle,
    level: 'beginner',
    teaches_this_skill: 0.9,
    level_fit: 0.8,
    is_instruction: true,
    style: 'technique',
    why: 'Clear first steps for this skill.',
    ...overrides,
  }
}

/** One kept verdict per video, all for the same Skill title. */
export function keepAllVerdicts(
  videos: readonly { id: string }[],
  skillTitle: string,
  overrides: Partial<FreshVerdict> = {},
): FreshVerdict[] {
  return videos.map((video) => freshVerdict(video.id, skillTitle, overrides))
}

/** What one Fresh Judge call answers: typed verdicts, or any `JudgeScript` (raw, error, hang). */
export type FreshJudgeScript = { verdicts: FreshVerdict[] } | JudgeScript

/** The fake Judge adapter, scripted with Fresh verdicts. Calls beyond the script reuse the last answer. */
export function createFakeFreshJudge(answers: readonly FreshJudgeScript[] = []): FakeJudge {
  return createFakeJudge([...answers])
}

// ---------------------------------------------------------------------------
// Store factory and item builder (task 9.1)
// ---------------------------------------------------------------------------

export interface FreshStores {
  clock: FakeClock
  /** Skill pipeline store; its lease, pool and quota maps are shared with `fresh`. */
  pipeline: InMemoryPipelineStore
  fresh: InMemoryFreshStore
}

/** One in-memory "database" for Fresh and the skill pipeline, on a fake clock. */
export function createFreshStores(clock: FakeClock = createFakeClock()): FreshStores {
  const pipeline = new InMemoryPipelineStore(() => clock.now())
  const fresh = new InMemoryFreshStore(() => clock.now(), pipeline)
  return { clock, pipeline, fresh }
}

/** A valid stored Fresh_Item with plain defaults, for seeding `InMemoryFreshStore.putItem`. */
export function fakeFreshItem(videoId: string, overrides: Partial<FreshItemRow> = {}): FreshItemRow {
  return {
    hobby: 'bouldering',
    language: 'en',
    videoId,
    skillNorm: 'footwork',
    level: 'beginner',
    channelId: 'UCfakechannel0000000000',
    video: {
      title: `Title ${videoId}`,
      channel: 'Channel',
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSeconds: 300,
      style: 'technique',
      teachesThisSkill: 0.9,
      levelFit: 0.8,
    },
    why: 'Clear first steps for this skill.',
    publishedMs: FAKE_CLOCK_START_MS - 3_600_000,
    foundMs: FAKE_CLOCK_START_MS,
    ...overrides,
  }
}
