import { handleWaitlist } from '../utils/waitlist-handlers'
import { waitlistDeps } from '../utils/waitlist-runtime'

/** Joins the founding member waitlist or the updates list. Public route. */
export default defineEventHandler(async (event) => {
  const body: unknown = await readBody(event).catch(() => null)
  const ip = getRequestIP(event, { xForwardedFor: true })
  const result = await handleWaitlist({ body, ip }, waitlistDeps())
  setResponseStatus(event, result.status)
  return result.body
})
