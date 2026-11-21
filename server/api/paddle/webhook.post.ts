import { handlePaddleWebhook } from '../../utils/billing-handlers'
import { paddleWebhookDeps } from '../../utils/billing-runtime'
import { sourceIp } from '../../utils/paddle-ips'

/**
 * Paddle notification destination. Only Paddle's published source IPs are
 * accepted (see paddle-ips.ts). The body is read raw (never parsed before
 * verification) and checked against the `paddle-signature` header with the
 * destination's signing secret.
 */
export default defineEventHandler(async (event) => {
  const rawBody = await readRawBody(event, 'utf8')
  const signature = getHeader(event, 'paddle-signature')
  const source = sourceIp({
    realIp: getHeader(event, 'x-real-ip'),
    forwardedFor: getHeader(event, 'x-forwarded-for'),
    remote: event.node.req.socket.remoteAddress,
  })
  const result = await handlePaddleWebhook({ rawBody: rawBody ?? undefined, signature, sourceIp: source }, paddleWebhookDeps())
  setResponseStatus(event, result.status)
  return result.body
})
