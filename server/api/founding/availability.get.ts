import { handleFoundingAvailability } from '../../utils/billing-handlers'
import { foundingAvailabilityDeps } from '../../utils/billing-runtime'

/** Whether a founding membership can still be bought (first 50 only). Public; no input is read. */
export default defineEventHandler(async (event) => {
  const result = await handleFoundingAvailability(foundingAvailabilityDeps())
  setResponseStatus(event, result.status)
  // Shared caches may keep a good answer for 30 seconds; browsers always ask again.
  setHeader(event, 'cache-control', result.status === 200 ? 'public, max-age=0, s-maxage=30' : 'no-store')
  return result.body
})
