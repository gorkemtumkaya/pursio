import { handleVideosRequest } from '../utils/video/handlers'
import { videosDeps } from '../utils/video/runtime'

export default defineEventHandler(async (event) => {
  const deps = videosDeps()
  if (!deps) {
    // The pipeline is not configured: show no videos and break nothing else.
    setResponseStatus(event, 200)
    return { videos: [], fillInProgress: false }
  }
  const body: unknown = await readBody(event).catch(() => null)
  const authorization = getHeader(event, 'authorization')
  const clientIp = getRequestIP(event, { xForwardedFor: true })
  const result = await handleVideosRequest({ body, authorization, clientIp }, deps)
  setResponseStatus(event, result.status)
  return result.body
})
