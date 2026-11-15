import { CHECK_SECRET_HEADER, handleCheckRequest } from '../../utils/fresh/handlers'
import { checkRouteDeps } from '../../utils/fresh/runtime'

// POST /api/fresh/check (Check_Route), called by pg_cron + pg_net every 15 minutes.
// The work is awaited here: no background execution exists on Vercel.
export default defineEventHandler(async (event) => {
  const secretHeader = getHeader(event, CHECK_SECRET_HEADER)
  const result = await handleCheckRequest({ secretHeader }, checkRouteDeps())
  setResponseStatus(event, result.status)
  return result.body
})
