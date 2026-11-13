import { createClient } from '@supabase/supabase-js'
import type { DeleteErrorCode } from '../../shared/types/cloud'
import type { DeleteDeps } from './account-handlers'
import { verifyAccessToken } from './supabase-server'

const VERIFY_TIMEOUT_MS = 5_000
const DELETE_TIMEOUT_MS = 10_000

/** Logs the code only (spec: accounts-cloud-save, Req 1.8). */
function logAccountError(entry: { code: DeleteErrorCode }): void {
  console.error('[account]', { code: entry.code })
}

/**
 * Dependencies of `DELETE /api/account`. This is the only code that reads the
 * Service_Role_Key (spec: accounts-cloud-save, Req 1.5). The key is never
 * logged or returned.
 */
export function accountDeleteDeps(): DeleteDeps {
  const config = useRuntimeConfig()
  const serviceRoleKey = typeof config.supabaseServiceRoleKey === 'string' ? config.supabaseServiceRoleKey.trim() : ''
  const url = typeof config.public.supabaseUrl === 'string' ? config.public.supabaseUrl.trim() : ''

  return {
    verifyToken: verifyAccessToken,
    serviceRoleKey,
    async deleteUser(userId) {
      if (url === '' || serviceRoleKey === '') throw new Error('delete_failed')
      const admin = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      // A hard delete: `on delete cascade` removes the profile, paths and progress.
      const { error } = await admin.auth.admin.deleteUser(userId)
      // The Supabase message is dropped, so it can never reach a log or a response.
      if (error) throw new Error('delete_failed')
    },
    verifyTimeoutMs: VERIFY_TIMEOUT_MS,
    deleteTimeoutMs: DELETE_TIMEOUT_MS,
    log: logAccountError,
  }
}
