import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PathSaveInput } from '../../shared/types/cloud'
import type { ChannelMute, FreshPathSkill } from '../../shared/types/fresh'
import type { VideoEvent } from '../../shared/types/video'
import { parseMute } from '../../shared/utils/channel-mutes'
import { buildSaveArgs } from '../../shared/utils/cloud-path'
import { fillColorSlots, isColorSlot } from '../../shared/utils/color-slot'
import { findCurrentNodeId } from '../../shared/utils/progress-engine'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { parseEvent } from '../../shared/utils/video-events'
import { languageCode } from '../../shared/utils/video-normalize'
import { windowSkillIds } from './fresh/compose'
import type { FreshScopePath, FreshUserData } from './fresh/handlers'
import { coerceGoalClass } from './goal-classifier'
import type { StoredPath } from './video/handlers'

// Server-side Supabase calls that act for a user (spec: accounts-cloud-save, Req 9).
// Only the public URL and anon key are used here; the service role key is not.

/** No session is stored or refreshed on the server. */
const SERVER_AUTH = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const

interface PublicSupabaseConfig {
  url: string
  anonKey: string
}

function publicSupabaseConfig(): PublicSupabaseConfig | null {
  const { supabaseUrl, supabaseAnonKey } = useRuntimeConfig().public
  const url = typeof supabaseUrl === 'string' ? supabaseUrl.trim() : ''
  const anonKey = typeof supabaseAnonKey === 'string' ? supabaseAnonKey.trim() : ''
  return url === '' || anonKey === '' ? null : { url, anonKey }
}

let shared: { url: string; anonKey: string; client: SupabaseClient } | null = null

/** One client for token checks, rebuilt only when the config changes. */
function sharedClient(config: PublicSupabaseConfig): SupabaseClient {
  if (!shared || shared.url !== config.url || shared.anonKey !== config.anonKey) {
    shared = { ...config, client: createClient(config.url, config.anonKey, { auth: SERVER_AUTH }) }
  }
  return shared.client
}

/**
 * Asks Supabase Auth whether the Access_Token is valid and returns its user id,
 * else `null`. This also rejects the token of a user deleted a moment ago. An
 * empty URL or anon key gives `null`.
 */
export async function verifyAccessToken(token: string, _signal?: AbortSignal): Promise<string | null> {
  const config = publicSupabaseConfig()
  if (!config) return null
  const { data, error } = await sharedClient(config).auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

/**
 * Loads the user's own path (tree and goal class) with the user's token, so Row Level
 * Security applies. Null when no visible path has this id; throws on any other failure.
 */
export async function loadPathForUser(token: string, pathId: string, signal?: AbortSignal): Promise<StoredPath | null> {
  const config = publicSupabaseConfig()
  if (!config) throw new Error('config_missing')
  const client = createClient(config.url, config.anonKey, {
    auth: SERVER_AUTH,
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const filtered = client.from('paths').select('tree, goal_class').eq('id', pathId)
  const { data, error } = await (signal ? filtered.abortSignal(signal) : filtered).maybeSingle()
  if (error) throw new Error('path_load_failed')
  if (!data) return null
  const row: { tree?: unknown; goal_class?: unknown } = data
  const loaded = loadSkillTree(row.tree)
  if (!loaded.ok) throw new Error('path_invalid')
  return { tree: loaded.value, goalClass: coerceGoalClass(row.goal_class) }
}

/** Most Video_Events the Fresh_Endpoint returns, newest first by update time. */
export const FRESH_EVENTS_LIMIT = 5000

/** Epoch ms of a timestamptz value, or null. */
function timeMs(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const ms = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function rowsOf(result: { data: unknown; error: unknown }, op: string): Record<string, unknown>[] {
  if (result.error) throw new Error(`fresh_user_read_failed:${op}`)
  const rows: unknown = result.data
  if (!Array.isArray(rows)) return []
  return rows.filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null && !Array.isArray(r))
}

/** A `video_events` row (snake_case, timestamptz) as a VideoEvent, or null when invalid. */
function eventFromRow(row: Record<string, unknown>): VideoEvent | null {
  return parseEvent({
    videoId: row.video_id,
    source: row.source,
    playedAt: timeMs(row.played_at),
    watchedSeconds: row.watched_seconds,
    finished: row.finished,
    saved: row.saved,
    savedAt: timeMs(row.saved_at),
    skipped: row.skipped,
    snapshot: row.snapshot ?? null,
    snapshotAt: timeMs(row.snapshot_at),
    updatedAt: timeMs(row.updated_at),
  })
}

/**
 * Loads what the Fresh_Endpoint needs for a Signed_In_User with the user's own token, so Row
 * Level Security applies (spec: fresh, Req 8.1, 8.8, 8.14, 8.16, 8.17): non-archived paths in
 * created order, their progress, the profile language, the newest 5000 Video_Events and the
 * Channel_Mutes, in parallel. Per path: Skills in path order, Current_Skill from the progress,
 * Current_Window (empty with no Current_Skill), Goal_Class (`none` when unset) and `activeAt`
 * (later of the last open and the last progress save), its Color_Slot and the number of its
 * completed Skills (spec: fresh-v2, Req 4.3, 9.9). A path whose tree cannot be loaded is
 * left out. Throws on any read error, with a fixed label only.
 */
export async function loadFreshUserData(token: string, userId: string, signal?: AbortSignal): Promise<FreshUserData> {
  const config = publicSupabaseConfig()
  if (!config) throw new Error('config_missing')
  const client = createClient(config.url, config.anonKey, {
    auth: SERVER_AUTH,
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const withSignal = <Q extends { abortSignal(signal: AbortSignal): Q }>(query: Q): Q =>
    signal ? query.abortSignal(signal) : query

  const [pathsRes, progressRes, profileRes, eventsRes, mutesRes] = await Promise.all([
    withSignal(
      client
        .from('paths')
        .select('id, hobby, hobby_id, tree, goal_class, last_opened_at, created_at, color_slot')
        .eq('user_id', userId)
        .eq('archived', false)
        .order('created_at', { ascending: true }),
    ),
    withSignal(client.from('progress').select('path_id, completed, updated_at').eq('user_id', userId)),
    withSignal(client.from('profiles').select('language').eq('id', userId)),
    withSignal(
      client
        .from('video_events')
        .select('video_id, source, played_at, watched_seconds, finished, saved, saved_at, skipped, snapshot, snapshot_at, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(FRESH_EVENTS_LIMIT),
    ),
    withSignal(client.from('channel_mutes').select('channel_id, muted, changed_at').eq('user_id', userId)),
  ])

  const pathRows = rowsOf(pathsRes, 'paths')
  const progressRows = rowsOf(progressRes, 'progress')
  const profileRows = rowsOf(profileRes, 'profiles')
  const eventRows = rowsOf(eventsRes, 'video_events')
  const muteRows = rowsOf(mutesRes, 'channel_mutes')

  const progressByPath = new Map<string, { completed: string[]; updatedMs: number | null }>()
  for (const row of progressRows) {
    if (typeof row.path_id !== 'string') continue
    const completed = Array.isArray(row.completed) ? row.completed.filter((id): id is string => typeof id === 'string') : []
    progressByPath.set(row.path_id, { completed, updatedMs: timeMs(row.updated_at) })
  }

  // The column is `not null` with a 1 to 5 check, so a missing or invalid slot is not
  // expected. If one shows up, the row gets a slot in creation order instead of failing.
  const slots = fillColorSlots(
    pathRows.map((row, index) => ({
      addedAt: timeMs(row.created_at) ?? index,
      colorSlot: isColorSlot(row.color_slot) ? row.color_slot : null,
    })),
  )

  const paths: FreshScopePath[] = []
  for (const [index, row] of pathRows.entries()) {
    if (typeof row.id !== 'string' || typeof row.hobby !== 'string') continue
    const loaded = loadSkillTree(row.tree)
    if (!loaded.ok) continue
    const tree = loaded.value
    const progress = progressByPath.get(row.id)
    const skills: FreshPathSkill[] = tree.sections.flatMap((section) =>
      section.nodes.map((node) => ({ id: node.id, title: node.title, level: section.level })),
    )
    const currentSkillId = findCurrentNodeId(tree, { completed: progress?.completed ?? [], quests: {} })
    const skillIds = new Set(skills.map((s) => s.id))
    const completedCount = new Set((progress?.completed ?? []).filter((id) => skillIds.has(id))).size
    const times = [timeMs(row.last_opened_at), progress?.updatedMs ?? null].filter((t): t is number => t !== null)
    paths.push({
      poolHobby: tree.hobby,
      path: {
        id: row.id,
        hobbyId: typeof row.hobby_id === 'string' ? row.hobby_id : null,
        hobby: row.hobby,
        goalClass: coerceGoalClass(row.goal_class),
        currentSkillId,
        windowSkillIds: windowSkillIds(skills, currentSkillId),
        skills,
        activeAt: times.length > 0 ? Math.max(...times) : null,
        colorSlot: slots[index] ?? 1,
        completedCount,
      },
    })
  }

  const rawLanguage: unknown = profileRows[0]?.language
  const events = eventRows.map(eventFromRow).filter((e): e is VideoEvent => e !== null)
  const mutes = muteRows
    .map((row) => parseMute({ channelId: row.channel_id, muted: row.muted, changedAt: timeMs(row.changed_at) }))
    .filter((m): m is ChannelMute => m !== null)

  return {
    language: languageCode(typeof rawLanguage === 'string' ? rawLanguage : null),
    paths,
    mutes,
    events,
  }
}

/** A `save_failed` error carrying a fixed, non-secret `reason` label. */
function saveError(reason: string): Error {
  return Object.assign(new Error('save_failed'), { reason })
}

/** 'rpc_error', plus ':<code>' only when the RPC code is a short safe token. */
function rpcReason(error: unknown): string {
  const code: unknown = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  return typeof code === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(code) ? `rpc_error:${code}` : 'rpc_error'
}

/**
 * Saves a generated path through `save_generated_path` with the user's own
 * token, so Row Level Security applies. Returns the Path_Row id, or throws.
 * The thrown error carries a safe `reason` label and never a Supabase
 * message, details or hint.
 */
export async function savePathForUser(token: string, input: PathSaveInput, signal?: AbortSignal): Promise<string> {
  const config = publicSupabaseConfig()
  if (!config) throw saveError('config_missing')
  const client = createClient(config.url, config.anonKey, {
    auth: SERVER_AUTH,
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const call = client.rpc('save_generated_path', buildSaveArgs(input))
  const { data, error } = await (signal ? call.abortSignal(signal) : call)
  const id: unknown = data
  if (error || typeof id !== 'string' || id === '') throw saveError(rpcReason(error))
  return id
}
