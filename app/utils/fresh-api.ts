import { z } from 'zod'
import type {
  ChannelMute,
  FreshCheckTime,
  FreshItemCard,
  FreshPath,
  FreshRequest,
  FreshResponseOk,
  FreshSkillPool,
  FreshSource,
  PoolCard,
} from '#shared/types/fresh'
import type { VideoEvent } from '#shared/types/video'
import { bearerHeader } from '#shared/utils/auth'
import { parseMute } from '#shared/utils/channel-mutes'
import { parseEvent } from '#shared/utils/video-events'

/** The only Fresh route the Client calls (spec: fresh, Req 18.3, 18.7). */
export const FRESH_ENDPOINT = '/api/fresh'

/** Sends one Fresh_Endpoint request. A missing token sends none (Signed_Out_User, Demo_Mode). Throws on any failure. */
export async function fetchFresh(body: FreshRequest, token: string | null, signal?: AbortSignal): Promise<FreshResponseOk> {
  const data = await $fetch<unknown>(FRESH_ENDPOINT, {
    method: 'POST',
    body,
    headers: token === null ? {} : bearerHeader(token),
    signal,
    retry: 0,
  })
  return parseFreshResponse(data)
}

const epochMs = z.number().finite()
const level = z.enum(['beginner', 'intermediate', 'advanced'])
const style = z.enum(['drill', 'technique', 'explainer', 'approachable'])
const goal = z.enum(['targeted', 'casual', 'none'])
const id = z.string().min(1)

const pathSchema = z.object({
  id,
  hobbyId: z.string().nullable(),
  hobby: z.string(),
  goalClass: goal,
  currentSkillId: z.string().nullable(),
  windowSkillIds: z.array(z.string()),
  skills: z.array(z.object({ id, title: z.string(), level })),
  activeAt: epochMs.nullable(),
})

const matchSchema = z.object({ pathId: z.string(), skillId: z.string() })
const cardBase = {
  videoId: id,
  title: z.string(),
  channel: z.string(),
  channelId: z.string().nullable(),
  thumbnailUrl: z.string(),
  durationSeconds: z.number().finite().min(0),
  style,
  poolLanguage: z.string(),
  matches: z.array(matchSchema),
}
const itemSchema = z.object({
  ...cardBase,
  kind: z.literal('fresh'),
  why: z.string(),
  publishedMs: epochMs,
  teachesThisSkill: z.number().finite(),
  levelFit: z.number().finite(),
  level,
})
const poolCardSchema = z.object({ ...cardBase, kind: z.literal('pool') })
const poolSchema = z.object({ pathId: z.string(), skillId: z.string(), videos: z.array(z.unknown()) })
const sourceSchema = z.object({ hobby: z.string(), language: z.string(), channelId: id, channelName: z.string() })
const checkTimeSchema = z.object({ hobby: z.string(), language: z.string(), lastSuccessMs: epochMs })

const responseSchema = z.object({
  nowMs: epochMs,
  language: z.string(),
  paths: z.array(pathSchema),
  items: z.array(z.unknown()),
  pools: z.array(z.unknown()),
  sources: z.array(z.unknown()),
  checkTimes: z.array(z.unknown()),
  mutes: z.array(z.unknown()).optional(),
  events: z.array(z.unknown()).optional(),
})

/** Keeps the entries that match `schema`; a single bad entry never fails the page. */
function keep<T>(list: readonly unknown[], schema: z.ZodType<T>): T[] {
  const out: T[] = []
  for (const entry of list) {
    const parsed = schema.safeParse(entry)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

/**
 * Reads a Fresh_Endpoint response. An error body (`{ error }`) or a wrong top-level shape
 * throws, so the page shows its error state (Req 16.4). Bad list entries are dropped.
 */
export function parseFreshResponse(data: unknown): FreshResponseOk {
  if (typeof data === 'object' && data !== null && 'error' in data) throw new Error('fresh request failed')
  const parsed = responseSchema.safeParse(data)
  if (!parsed.success) throw new Error('bad fresh response')
  const raw = parsed.data
  const paths: FreshPath[] = raw.paths
  const items: FreshItemCard[] = keep(raw.items, itemSchema)
  const pools: FreshSkillPool[] = keep(raw.pools, poolSchema).map((pool) => ({
    pathId: pool.pathId,
    skillId: pool.skillId,
    videos: keep<PoolCard>(pool.videos, poolCardSchema),
  }))
  const sources: FreshSource[] = keep(raw.sources, sourceSchema)
  const checkTimes: FreshCheckTime[] = keep(raw.checkTimes, checkTimeSchema)
  const mutes: ChannelMute[] = []
  for (const entry of raw.mutes ?? []) {
    const rec = parseMute(entry)
    if (rec) mutes.push(rec)
  }
  const events: VideoEvent[] = []
  for (const entry of raw.events ?? []) {
    const rec = parseEvent(entry)
    if (rec) events.push(rec)
  }
  return { nowMs: raw.nowMs, language: raw.language, paths, items, pools, sources, checkTimes, mutes, events }
}
