import { handleBillingStatus } from '../../utils/billing-handlers'
import { accountBillingDeps } from '../../utils/billing-runtime'

/** The signed-in account's subscription and access. Only the Authorization header is read. */
export default defineEventHandler(async (event) => {
  const result = await handleBillingStatus({ authorization: getHeader(event, 'authorization') }, accountBillingDeps())
  setResponseStatus(event, result.status)
  setHeader(event, 'cache-control', 'no-store')
  return result.body
})
