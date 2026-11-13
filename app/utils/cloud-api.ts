import type { SupabaseClient } from '@supabase/supabase-js'
import type { PathInsertRow, ProgressWriteRow } from '#shared/types/cloud'
import type { Theme } from '#shared/types/theme'

/**
 * Every table call of the browser (spec: accounts-cloud-save). All of them run
 * with the user's own token under Row Level Security. Each method throws when
 * Supabase reports an error and returns rows as `unknown`, to be parsed by
 * `cloud-rows`. It makes no decisions.
 */
export interface CloudApi {
  listPaths(signal?: AbortSignal): Promise<unknown[]>
  listProgress(signal?: AbortSignal): Promise<unknown[]>
  getProfile(): Promise<unknown | null>
  updateProfile(patch: { theme?: Theme; display_name?: string | null }): Promise<void>
  setArchived(pathId: string, archived: boolean): Promise<void>
  deletePath(pathId: string): Promise<void>
  deletePaths(ids: readonly string[]): Promise<void>
  insertPaths(rows: readonly PathInsertRow[], signal?: AbortSignal): Promise<void>
  insertProgress(rows: readonly ProgressWriteRow[], signal?: AbortSignal): Promise<void>
  /** Creates the row when absent (conflict on `path_id`). */
  upsertProgress(row: ProgressWriteRow): Promise<void>
}

/** A failed call. It carries no Supabase message, so none can reach the screen. */
export class CloudError extends Error {
  constructor() {
    super('cloud_request_failed')
    this.name = 'CloudError'
  }
}

interface Outcome {
  error: unknown
  data?: unknown
}

function rowsOf(result: Outcome): unknown[] {
  if (result.error) throw new CloudError()
  const rows: unknown = result.data
  return Array.isArray(rows) ? (rows as unknown[]) : []
}

function check(result: Outcome): void {
  if (result.error) throw new CloudError()
}

/** An update that matched no row did not save anything, so it counts as a failure. */
function checkTouched(result: Outcome): void {
  if (rowsOf(result).length === 0) throw new CloudError()
}

export function createCloudApi(client: SupabaseClient, userId: string): CloudApi {
  return {
    async listPaths(signal) {
      const query = client
        .from('paths')
        .select('id, level, tree, model, archived, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      return rowsOf(await (signal ? query.abortSignal(signal) : query))
    },
    async listProgress(signal) {
      const query = client.from('progress').select('path_id, completed, quests, completed_at').eq('user_id', userId)
      return rowsOf(await (signal ? query.abortSignal(signal) : query))
    },
    async getProfile() {
      const result: Outcome = await client
        .from('profiles')
        .select('id, display_name, theme, created_at')
        .eq('id', userId)
        .maybeSingle()
      check(result)
      return result.data ?? null
    },
    async updateProfile(patch) {
      checkTouched(await client.from('profiles').update(patch).eq('id', userId).select('id'))
    },
    async setArchived(pathId, archived) {
      checkTouched(
        await client.from('paths').update({ archived }).eq('id', pathId).eq('user_id', userId).select('id'),
      )
    },
    async deletePath(pathId) {
      check(await client.from('paths').delete().eq('id', pathId).eq('user_id', userId))
    },
    async deletePaths(ids) {
      if (ids.length === 0) return
      check(await client.from('paths').delete().in('id', [...ids]).eq('user_id', userId))
    },
    async insertPaths(rows, signal) {
      if (rows.length === 0) return
      const query = client.from('paths').insert([...rows])
      check(await (signal ? query.abortSignal(signal) : query))
    },
    async insertProgress(rows, signal) {
      if (rows.length === 0) return
      const query = client.from('progress').insert([...rows])
      check(await (signal ? query.abortSignal(signal) : query))
    },
    async upsertProgress(row) {
      check(await client.from('progress').upsert(row, { onConflict: 'path_id' }))
    },
  }
}
