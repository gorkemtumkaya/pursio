import { handleFreshRequest } from '../utils/fresh/handlers'
import { freshEndpointDeps } from '../utils/fresh/runtime'

// POST /api/fresh (Fresh_Endpoint). Read-only: no provider, model, feed or fill call.
export default defineEventHandler(async (event) => {
  const deps = freshEndpointDeps()
  if (!deps) {
    // Fresh is not configured: an empty page, and nothing else breaks.
    setResponseStatus(event, 200)
    return { nowMs: Date.now(), language: 'en', paths: [], items: [], pools: [], sources: [], checkTimes: [], mutes: [], events: [] }
  }
  const body: unknown = await readBody(event).catch(() => null)
  const authorization = getHeader(event, 'authorization')
  const clientIp = getRequestIP(event, { xForwardedFor: true })
  const result = await handleFreshRequest({ body, authorization, clientIp }, deps)
  setResponseStatus(event, result.status)
  return result.body
})
