import type { BillingStatusResponse } from '#shared/types/billing'

// Text of the Subscription group on the Settings_Page.

export const BILLING_COPY = {
  title: 'Subscription',
  loading: 'Loading…',
  loadFailed: "We couldn't load your subscription.",
  retry: 'Try again',
  manage: 'Manage subscription',
  opening: 'Opening…',
  seePlans: 'See plans',
  portalFailed: "We couldn't open the billing portal. Try again.",
  signInToManage: 'Log in with the email you used at checkout to manage billing.',
} as const

/** "21 Nov 2026" in the reader's locale. Dates only; prices are never formatted here. */
export function billingDate(iso: string, locale?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

/** Title and one-line state for the Subscription row. */
export function billingSummary(status: BillingStatusResponse, locale?: string): { title: string; hint: string } {
  const sub = status.subscription
  // A founding member has Plus for life, whatever a subscription beside it says.
  if (status.founding) return { title: 'Founding member', hint: 'Plus for life · nothing more to pay' }
  if (!sub) return { title: 'Free plan', hint: 'No subscription' }
  const change = sub.scheduledChange
  if (change?.action === 'cancel') return { title: 'Plus', hint: `Cancels on ${billingDate(change.at, locale)}` }
  if (change?.action === 'pause') return { title: 'Plus', hint: `Pauses on ${billingDate(change.at, locale)}` }
  const next = sub.nextBilledAt ? billingDate(sub.nextBilledAt, locale) : ''
  switch (sub.status) {
    case 'trialing':
      return { title: 'Plus', hint: next ? `Free trial · first payment on ${next}` : 'Free trial' }
    case 'active':
      return { title: 'Plus', hint: next ? `Renews on ${next}` : 'Active' }
    case 'past_due':
      return { title: 'Plus', hint: 'Payment failed · update your payment method' }
    case 'paused':
      return { title: 'Plus (paused)', hint: change?.action === 'resume' ? `Resumes on ${billingDate(change.at, locale)}` : 'Paused' }
    case 'canceled':
      return { title: 'Free plan', hint: 'Plus ended' }
    default:
      return { title: 'Free plan', hint: 'No active subscription' }
  }
}
