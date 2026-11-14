/**
 * YouTube Data API v3 implementation of VideoProvider.
 * Only `select-provider.ts` may import this module.
 * The API key travels in the `x-goog-api-key` header, so it is never part of a URL.
 */
import {
  ProviderError,
  type SearchHit,
  type VideoDetails,
  type VideoProvider,
} from './provider'

const BASE_URL = 'https://www.googleapis.com/youtube/v3'
const TIMEOUT_MS = 10_000
const MAX_SEARCH_RESULTS = 10
const MAX_IDS = 50

export interface YouTubeProviderOptions {
  apiKey: string
  fetcher?: typeof fetch
}

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function count(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** ISO 8601 duration (PnDTnHnMnS) to seconds, or null when it cannot be parsed. */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value)
  if (!m || value === 'P' || value.endsWith('T')) return null
  const [, d, h, min, s] = m
  return Math.floor(
    Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0),
  )
}

function thumbnailOf(snippet: Json): string {
  const thumbs = snippet.thumbnails
  if (!isRecord(thumbs)) return ''
  for (const key of ['medium', 'high', 'default', 'standard', 'maxres']) {
    const t = thumbs[key]
    if (isRecord(t) && typeof t.url === 'string') return t.url
  }
  return ''
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function createYouTubeProvider(options: YouTubeProviderOptions): VideoProvider {
  const fetcher = options.fetcher ?? fetch
  const apiKey = options.apiKey.trim()

  async function call(path: string, params: URLSearchParams, signal?: AbortSignal): Promise<Json> {
    if (!apiKey) throw new ProviderError('not_configured')
    const timeout = AbortSignal.timeout(TIMEOUT_MS)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    let res: Response
    try {
      res = await fetcher(`${BASE_URL}/${path}?${params.toString()}`, {
        method: 'GET',
        headers: { 'x-goog-api-key': apiKey, 'accept': 'application/json' },
        signal: combined,
      })
    }
    catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'TimeoutError' || name === 'AbortError' || combined.aborted) {
        throw new ProviderError('timeout')
      }
      throw new ProviderError('upstream')
    }
    if (!res.ok) {
      if (res.status === 403 && await isQuotaError(res)) throw new ProviderError('quota_exceeded')
      throw new ProviderError('upstream')
    }
    try {
      const body: unknown = await res.json()
      if (!isRecord(body)) throw new ProviderError('upstream')
      return body
    }
    catch (err) {
      if (err instanceof ProviderError) throw err
      throw new ProviderError(combined.aborted ? 'timeout' : 'upstream')
    }
  }

  return {
    async search(query, maxResults, opts) {
      const params = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        videoEmbeddable: 'true',
        safeSearch: 'strict',
        maxResults: String(Math.max(1, Math.min(MAX_SEARCH_RESULTS, Math.floor(maxResults)))),
        q: query,
      })
      if (opts.language !== 'und') params.set('relevanceLanguage', opts.language)
      const body = await call('search', params, opts.signal)
      const items = Array.isArray(body.items) ? body.items : []
      const hits: SearchHit[] = []
      for (const item of items) {
        if (!isRecord(item)) continue
        const id = isRecord(item.id) ? str(item.id.videoId) : null
        if (!id) continue
        const snippet = isRecord(item.snippet) ? item.snippet : {}
        hits.push({
          id,
          title: str(snippet.title) ?? '',
          channel: str(snippet.channelTitle) ?? '',
          thumbnailUrl: thumbnailOf(snippet),
        })
      }
      return hits
    },

    async getDetails(ids, opts) {
      if (ids.length < 1 || ids.length > MAX_IDS) throw new ProviderError('upstream')
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics,status',
        id: ids.join(','),
        maxResults: String(MAX_IDS),
      })
      const body = await call('videos', params, opts.signal)
      const items = Array.isArray(body.items) ? body.items : []
      const out: VideoDetails[] = []
      for (const item of items) {
        if (!isRecord(item)) continue
        const id = str(item.id)
        if (!id) continue
        const snippet = isRecord(item.snippet) ? item.snippet : {}
        const content = isRecord(item.contentDetails) ? item.contentDetails : {}
        const stats = isRecord(item.statistics) ? item.statistics : {}
        const status = isRecord(item.status) ? item.status : {}
        const caption = str(content.caption)
        out.push({
          id,
          title: str(snippet.title) ?? '',
          channel: str(snippet.channelTitle) ?? '',
          description: str(snippet.description) ?? '',
          thumbnailUrl: thumbnailOf(snippet),
          durationSeconds: parseIsoDuration(content.duration),
          viewCount: count(stats.viewCount),
          likeCount: count(stats.likeCount),
          publishedAt: str(snippet.publishedAt),
          defaultAudioLanguage: str(snippet.defaultAudioLanguage) || null,
          hasCaptions: caption === 'true' ? true : caption === 'false' ? false : null,
          embeddable: bool(status.embeddable),
        })
      }
      return out
    },
  }
}

async function isQuotaError(res: Response): Promise<boolean> {
  try {
    const body: unknown = await res.json()
    if (!isRecord(body) || !isRecord(body.error) || !Array.isArray(body.error.errors)) return false
    return body.error.errors.some(
      e => isRecord(e) && (e.reason === 'quotaExceeded' || e.reason === 'dailyLimitExceeded'),
    )
  }
  catch {
    return false
  }
}
