import type { SupabaseClient } from '@supabase/supabase-js'

let cached: { url: string; anonKey: string; client: Promise<SupabaseClient> } | null = null

/**
 * The browser's Supabase_Client, built once. The package is loaded with a
 * dynamic `import()`, so pages that never start a session (Demo_Mode) never
 * download it (spec: accounts-cloud-save, Req 12.1). Resolves to `null` when
 * the URL or the anon key is empty.
 *
 * Sign-in links use the implicit flow, so a magic link also works when it is
 * opened in another browser than the one that asked for it.
 */
export function getSupabase(url: string, anonKey: string): Promise<SupabaseClient | null> {
  if (url === '' || anonKey === '') return Promise.resolve(null)
  if (!cached || cached.url !== url || cached.anonKey !== anonKey) {
    const client = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      }),
    )
    const entry = { url, anonKey, client }
    cached = entry
    // A failed download is not cached, so "Try again" can load it again.
    client.catch(() => {
      if (cached === entry) cached = null
    })
  }
  return cached.client
}
