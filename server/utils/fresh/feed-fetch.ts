/**
 * Channel_Feed fetch (spec: fresh, Req 4.1, 4.4, 18.3). Server only: the Client never
 * fetches a feed. A plain GET to the fixed YouTube feed URL, with no API key and no
 * quota units. Every failure (connection error, non-2xx status, the 10 s timeout, the
 * Call_Deadline, a body over 1 MB) gives `{ ok: false }`; the caller tells a deadline
 * abort apart by its own deadline signal. Nothing from the request or response is logged.
 */
import { isValidChannelId } from '../../../shared/utils/channel-mutes'

/** A feed fetch is aborted after this many ms (Req 4.4). */
export const FEED_TIMEOUT_MS = 10_000
/** A feed body larger than this many bytes is discarded (Req 4.4). */
export const FEED_MAX_BYTES = 1_048_576
/** Channel_Feed fetches in progress at the same time, at most (Req 4.1). */
export const FEED_CONCURRENCY = 8

/** Fixed origin and path of every Channel_Feed request. */
const FEED_ORIGIN = 'https://www.youtube.com'
const FEED_PATH = '/feeds/videos.xml'

export type FeedFetchResult = { ok: true; xml: string } | { ok: false }

export interface FeedFetchOptions {
  fetcher: typeof fetch
  /** The Call_Deadline signal; combined with the 10 s timeout. */
  signal: AbortSignal
  /** Builds the timeout signal. Default `AbortSignal.timeout`; tests pass a fake clock timer. */
  timer?: (ms: number) => AbortSignal
}

const FAILED: FeedFetchResult = { ok: false }

/** The feed URL for one channel id; the id is URL-encoded as the only query value. */
export function channelFeedUrl(channelId: string): string {
  return `${FEED_ORIGIN}${FEED_PATH}?channel_id=${encodeURIComponent(channelId)}`
}

/** Cancels a body we will not read, so the connection is released. Never throws. */
async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel()
  } catch {
    // Nothing to do: the feed is discarded either way.
  }
}

/** One read that settles as `null` when the signal fires first, so a stalled stream cannot hang the check. */
function readOrAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array> | null> {
  if (signal.aborted) return Promise.resolve(null)
  return new Promise((resolve, reject) => {
    const onAbort = (): void => resolve(null)
    signal.addEventListener('abort', onAbort, { once: true })
    reader.read().then(
      (result) => {
        signal.removeEventListener('abort', onAbort)
        resolve(result)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

/** Reads the body as UTF-8 text, or null once it passes `FEED_MAX_BYTES` or the signal fires. */
async function readCapped(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<string | null> {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let bytes = 0
  let text = ''
  const stop = async (): Promise<null> => {
    try {
      await reader.cancel()
    } catch {
      // Already errored or closed.
    }
    return null
  }
  for (;;) {
    const result = await readOrAbort(reader, signal)
    if (result === null) return stop()
    if (result.done) return text + decoder.decode()
    bytes += result.value.byteLength
    if (bytes > FEED_MAX_BYTES) return stop()
    text += decoder.decode(result.value, { stream: true })
  }
}

/** Fetches the Channel_Feed of one channel. Never throws. */
export async function fetchChannelFeed(channelId: string, opts: FeedFetchOptions): Promise<FeedFetchResult> {
  if (!isValidChannelId(channelId) || opts.signal.aborted) return FAILED
  const timeout = (opts.timer ?? ((ms: number) => AbortSignal.timeout(ms)))(FEED_TIMEOUT_MS)
  const signal = AbortSignal.any([opts.signal, timeout])
  try {
    const res = await opts.fetcher(channelFeedUrl(channelId), { method: 'GET', signal })
    if (!res.ok) {
      await discardBody(res)
      return FAILED
    }
    const declared = res.headers.get('content-length')
    if (declared !== null && Number(declared) > FEED_MAX_BYTES) {
      await discardBody(res)
      return FAILED
    }
    if (signal.aborted) {
      await discardBody(res)
      return FAILED
    }
    if (!res.body) return { ok: true, xml: '' }
    const xml = await readCapped(res.body, signal)
    return xml === null ? FAILED : { ok: true, xml }
  } catch {
    return FAILED
  }
}

/**
 * Runs `fn` over `items` with at most `limit` calls in progress (a limit below 1 or NaN
 * counts as 1). Results follow the order of `items`. Rejects with the first rejection of `fn`;
 * `fetchChannelFeed` never rejects.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const width = Math.min(items.length, Number.isNaN(limit) ? 1 : Math.max(1, Math.floor(limit)))
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: width }, worker))
  return results
}
