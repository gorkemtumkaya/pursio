import { startsSession } from '~/utils/session-start'

/**
 * Starts the session on every page except Demo_Mode and the sample pages (spec:
 * accounts-cloud-save, Req 3.1, 12.1; spec: fresh, decision D13 for `/fresh?demo=1`; spec:
 * sample-path, Req 3.2 for `/try/`). It is not awaited: pages show their own loading state.
 * Where no session starts, the Supabase_Client is never built, so a stored session is neither
 * read nor refreshed (Req 12.4).
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!import.meta.client) return
  if (!startsSession(to.path, to.query)) return
  void useAuth().ensure()
})
