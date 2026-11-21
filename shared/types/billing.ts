// Paddle billing mirror (POST /api/paddle/webhook) and the account's billing routes.

/** Paddle subscription statuses. A status Paddle adds later is stored as-is and grants no access. */
export type PaddleSubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled'

export type ScheduledChangeAction = 'cancel' | 'pause' | 'resume'

/** A `subscriptions` row as the server reads it. Times are ISO strings. */
export interface MirroredSubscription {
  subscriptionId: string
  customerId: string
  status: string
  priceId: string
  productId: string
  scheduledChangeAction: ScheduledChangeAction | null
  scheduledChangeAt: string | null
  nextBilledAt: string | null
  paddleUpdatedAt: string
}

/** GET /api/billing/status */
export interface BillingStatusResponse {
  /** Whether the account has paid access now: a subscription that grants it (see `grantsPaidAccess`) or a founding membership. */
  access: boolean
  /** Whether the account holds a founding membership that was not refunded: lifetime Plus, the badge and the Founding Wick outfit. */
  founding: boolean
  subscription: {
    status: string
    priceId: string
    scheduledChange: { action: ScheduledChangeAction; at: string } | null
    nextBilledAt: string | null
  } | null
  /** Whether "Manage subscription" can open the portal: a Paddle customer matches the verified email. */
  canManage: boolean
  /** That Paddle customer's id (`ctm_…`), for Paddle Retain's `pwCustomer`; null without one. Resolved on the server only. */
  customerId: string | null
}

export type BillingErrorCode = 'unauthorized' | 'no_customer' | 'not_configured' | 'failed'

export interface BillingErrorResponse {
  error: BillingErrorCode
}

/** POST /api/billing/portal */
export interface PortalResponse {
  url: string
}

/** GET /api/founding/availability */
export interface FoundingAvailabilityResponse {
  /** False once the first 50 memberships are sold. */
  available: boolean
}
