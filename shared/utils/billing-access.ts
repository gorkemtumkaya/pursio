import type { MirroredSubscription } from '../types/billing'

/**
 * Statuses that grant paid access:
 * - `active` and `trialing`: yes.
 * - `past_due`: yes, as a grace period while Paddle retries the payment. Paddle
 *   then cancels or pauses the subscription per the account's dunning settings,
 *   and that status change ends access.
 * - `paused`, `canceled` and any status Paddle adds later: no.
 *
 * A scheduled change (cancel or pause at the end of the period) never revokes
 * access by itself; only the status changing to `canceled` or `paused` does.
 */
const ACCESS_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due'])

export function grantsPaidAccess(subscription: Pick<MirroredSubscription, 'status'> | null | undefined): boolean {
  return subscription != null && ACCESS_STATUSES.has(subscription.status)
}

/**
 * The subscription to show for an account with several: one that grants
 * access first, then the most recently updated in Paddle.
 */
export function currentSubscription<S extends Pick<MirroredSubscription, 'status' | 'paddleUpdatedAt'>>(
  subscriptions: readonly S[],
): S | null {
  let best: S | null = null
  for (const sub of subscriptions) {
    if (best === null) {
      best = sub
      continue
    }
    const subAccess = grantsPaidAccess(sub)
    const bestAccess = grantsPaidAccess(best)
    if (subAccess !== bestAccess) {
      if (subAccess) best = sub
      continue
    }
    if (Date.parse(sub.paddleUpdatedAt) > Date.parse(best.paddleUpdatedAt)) best = sub
  }
  return best
}
