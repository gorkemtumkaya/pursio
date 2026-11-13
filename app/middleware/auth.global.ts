/**
 * Starts the session on every page except Demo_Mode (spec: accounts-cloud-save,
 * Req 3.1, 12.1). It is not awaited: pages show their own loading state. In
 * Demo_Mode the Supabase_Client is never built, so a stored session is neither
 * read nor refreshed (Req 12.4).
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!import.meta.client) return
  if (to.path === '/path' && to.query.demo === '1') return
  void useAuth().ensure()
})
