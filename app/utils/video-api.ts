import type { RankedVideo, SkillVideosState, VideosRequest } from '#shared/types/video'
import { bearerHeader } from '#shared/utils/auth'
import { languageCode } from '#shared/utils/video-normalize'

/** Polling while a fill runs: every 5 s, at most 24 polls (120 s) (spec: skill-video-pipeline, Req 12.7, 12.9). */
export const POLL_INTERVAL_MS = 5_000
export const MAX_POLLS = 24

export interface VideosResult {
  videos: RankedVideo[]
  fillInProgress: boolean
}

/** Sends one videos request. A missing token sends none (Signed_Out_User). Throws on any failure. */
export async function fetchVideos(
  request: VideosRequest,
  token: string | null,
  signal?: AbortSignal,
): Promise<VideosResult> {
  // A Signed_Out_User sends no path or skill id (Req 12.16).
  const body: VideosRequest =
    token === null
      ? { hobby: request.hobby, skillTitle: request.skillTitle, level: request.level, language: request.language }
      : request
  const data = await $fetch<unknown>('/api/videos', {
    method: 'POST',
    body,
    headers: token === null ? {} : bearerHeader(token),
    signal,
    retry: 0,
  })
  return parseVideosResult(data)
}

/** Fire and forget: asks the server to fill the window around the current skill (Req 8.3). Never throws. */
export async function requestFill(
  params: { pathId: string; currentSkillId: string; language: string | null },
  token: string | null,
): Promise<void> {
  if (token === null) return
  try {
    await $fetch('/api/videos/fill', {
      method: 'POST',
      body: { pathId: params.pathId, currentSkillId: params.currentSkillId, language: languageCode(params.language) },
      headers: bearerHeader(token),
      retry: 0,
    })
  } catch {
    // Videos are optional: a failed fill request changes nothing for the learner.
  }
}

/** Reads the response shape; anything else is an error. */
export function parseVideosResult(data: unknown): VideosResult {
  if (typeof data !== 'object' || data === null) throw new Error('bad videos response')
  const record = data as Record<string, unknown>
  if (!Array.isArray(record.videos) || typeof record.fillInProgress !== 'boolean') {
    throw new Error('bad videos response')
  }
  return { videos: record.videos as RankedVideo[], fillInProgress: record.fillInProgress }
}

/** The state for one response. A Signed_Out_User never sees `finding` (Req 12.7, 12.8, 12.17). */
export function stateFromResult(result: VideosResult, language: string | null, signedIn: boolean): SkillVideosState {
  if (result.videos.length > 0) return { kind: 'ready', videos: result.videos, language: languageCode(language) }
  if (signedIn && result.fillInProgress) return { kind: 'finding' }
  return { kind: 'hidden' }
}

export interface VideosLoopDeps {
  fetchOnce: () => Promise<VideosResult>
  sleep: (ms: number) => Promise<void>
  /** True once the sheet closed or the node changed. */
  cancelled: () => boolean
  onState: (state: SkillVideosState) => void
}

/**
 * Loads videos once, then, for a signed-in user whose fill is in progress with 0 videos,
 * polls every 5 s up to 24 times. Stops when the answer changes, on cancel, or on failure.
 * A failure hides the section (Req 12.10).
 */
export async function runVideosLoop(
  params: { language: string | null; signedIn: boolean },
  deps: VideosLoopDeps,
): Promise<void> {
  const { language, signedIn } = params
  let polls = 0
  for (;;) {
    if (deps.cancelled()) return
    let state: SkillVideosState
    try {
      state = stateFromResult(await deps.fetchOnce(), language, signedIn)
    } catch {
      if (!deps.cancelled()) deps.onState({ kind: 'hidden' })
      return
    }
    if (deps.cancelled()) return
    deps.onState(state)
    if (state.kind !== 'finding' || polls >= MAX_POLLS) return
    await deps.sleep(POLL_INTERVAL_MS)
    polls += 1
  }
}
