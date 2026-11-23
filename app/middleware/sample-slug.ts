import { sampleRedirect } from '~/utils/sample-route'

/**
 * Sends a slug that is not a sample page to `/new` (spec: sample-path, Req 1.2, 1.4). Runs on the
 * server for a direct request, so the answer is a real 302, and in the browser for a navigation
 * inside the app.
 */
export default defineNuxtRouteMiddleware((to) => {
  const raw = to.params.hobby
  const slug = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')
  const target = sampleRedirect(slug, to.query)
  if (target === null) return
  return navigateTo(target, { redirectCode: 302, replace: true })
})
