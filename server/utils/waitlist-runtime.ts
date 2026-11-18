import { createClient } from '@supabase/supabase-js'
import type { WaitlistErrorCode } from '../../shared/utils/waitlist'
import { createRateLimiter } from './rate-limiter'
import type { WaitlistDeps } from './waitlist-handlers'

const SAVE_TIMEOUT_MS = 8_000
/** Sign-ups per IP address per hour. Kept in memory per server instance (see APP-SEC-01). */
const LIMIT_PER_HOUR = 5

const limiter = createRateLimiter({ limit: LIMIT_PER_HOUR, windowMs: 60 * 60 * 1000, now: () => Date.now() })

/** Logs the code only, never the address. */
function logWaitlistError(entry: { code: WaitlistErrorCode }): void {
  console.error('[waitlist]', { code: entry.code })
}

/**
 * Dependencies of `POST /api/waitlist`. The `waitlist` table has Row Level
 * Security with no policy, so only the Service_Role_Key can write to it.
 */
export function waitlistDeps(): WaitlistDeps {
  const config = useRuntimeConfig()
  const serviceRoleKey = typeof config.supabaseServiceRoleKey === 'string' ? config.supabaseServiceRoleKey.trim() : ''
  const url = typeof config.public.supabaseUrl === 'string' ? config.public.supabaseUrl.trim() : ''

  return {
    serviceRoleKey,
    limiter,
    saveTimeoutMs: SAVE_TIMEOUT_MS,
    log: logWaitlistError,
    async save({ email, kind }) {
      if (url === '' || serviceRoleKey === '') throw new Error('save_failed')
      const admin = createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
      // A founding sign-up replaces an earlier "updates" row for the same address.
      // An "updates" sign-up never downgrades a founding one: duplicates are ignored.
      const { error } = await admin
        .from('waitlist')
        .upsert({ email, kind }, { onConflict: 'email', ignoreDuplicates: kind === 'updates' })
      // The Supabase message is dropped, so it can never reach a log or a response.
      if (error) throw new Error('save_failed')
    },
  }
}
