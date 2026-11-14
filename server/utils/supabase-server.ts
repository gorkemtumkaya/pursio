import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PathSaveInput } from '../../shared/types/cloud'
import { buildSaveArgs } from '../../shared/utils/cloud-path'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
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
