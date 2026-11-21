import { handleBillingPortal } from '../../utils/billing-handlers'
import { accountBillingDeps } from '../../utils/billing-runtime'

/**
 * Mints a Paddle customer portal session for the signed-in account and returns
 * its URL only. Only the Authorization header is read; the body is ignored, so
 * a customer id sent by the client can never be used.
 */
export default defineEventHandler(async (event) => {
  const result = await handleBillingPortal({ authorization: getHeader(event, 'authorization') }, accountBillingDeps())
  setResponseStatus(event, result.status)
  setHeader(event, 'cache-control', 'no-store')
  return result.body
})
