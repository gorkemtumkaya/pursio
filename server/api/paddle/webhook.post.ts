import { handlePaddleWebhook } from '../../utils/billing-handlers'
import { paddleWebhookDeps } from '../../utils/billing-runtime'

/**
 * Paddle notification destination. The body is read raw (never parsed before
 * verification) and checked against the `paddle-signature` header with the
 * destination's signing secret.
 */
export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  const signature = getHeader(event, 'paddle-signature')
  const result = await handlePaddleWebhook({ rawBody: rawBody ?? undefined, signature }, paddleWebhookDeps())
  setResponseStatus(event, result.status)
  return result.body
})
