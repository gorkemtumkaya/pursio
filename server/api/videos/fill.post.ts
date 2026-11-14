import { handleFillRequest } from '../../utils/video/handlers'
import { fillDeps } from '../../utils/video/runtime'

export default defineEventHandler(async (event) => {
  const deps = fillDeps()
  if (!deps) {
    // The pipeline is not configured: accept and do nothing; videos are optional.
    setResponseStatus(event, 202)
    return { accepted: true }
  }
  const body: unknown = await readBody(event).catch(() => null)
  const authorization = getHeader(event, 'authorization')
  const result = await handleFillRequest({ body, authorization }, deps)
  setResponseStatus(event, result.status)
  return result.body
})
