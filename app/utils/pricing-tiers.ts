import type { Environments } from '@paddle/paddle-js'

/**
 * The tiers on /pricing. Edit names, text and features in TIER_TEXT and price
 * IDs in PRICE_IDS; the page renders `tiersFor(environment)`, in order.
 *
 * Sandbox and live are separate Paddle accounts with separate IDs, so each
 * environment (NUXT_PUBLIC_PADDLE_ENV) has its own set. A price ID from the
 * other account fails with "price not found".
 */
export interface Tier {
  name: 'Free' | 'Plus'
  description: string
  features: string[]
  /** Monthly and yearly Paddle price IDs. `null` is a free tier: its button goes to the app, not checkout. */
  priceId: { month: string; year: string } | null
  /** Highlights the card. */
  featured: boolean
}

export type BillingFrequency = 'month' | 'year'

type PaidPriceIds = { month: string; year: string }

/**
 * Paddle price IDs of the Plus subscription per environment.
 * Sandbox product pro_01m7yxc6q85jyxdnpnbd2k1wc9, live product pro_01m7ywxhgq82670exfb88hyymp.
 */
export const PRICE_IDS: Record<Environments, { plus: PaidPriceIds }> = {
  sandbox: {
    plus: { month: 'pri_01m7yxc793p1af7c9vnmqcmw3n', year: 'pri_01m7yxc7ekh0c4wb7xc24w7q69' },
  },
  production: {
    plus: { month: 'pri_01m7z6481j4bcy66nv7yfax61s', year: 'pri_01m7z6488p39zfejmazaz0f408' },
  },
}

/** The one-time Founding member price per environment; the server needs it too, so it lives in shared. */
export { FOUNDING_PRICE_ID } from '#shared/utils/paddle-catalog'

/** The tiers with the price IDs of one Paddle environment. */
export function tiersFor(environment: Environments): readonly Tier[] {
  return [
    {
      name: 'Free',
      description: 'Everything you need to start a hobby.',
      features: ['Build skill paths for any hobby', 'Daily quests and progress tracking', 'No account needed to try it'],
      priceId: null,
      featured: false,
    },
    {
      name: 'Plus',
      description: 'For learners who want more from every path.',
      // Placeholder features: replace with what Plus actually unlocks.
      features: ['Everything in Free', 'Plus features as they ship, at no extra cost', 'Support an independent, open-source app'],
      priceId: PRICE_IDS[environment].plus,
      featured: true,
    },
  ]
}

/** Every paid price ID in the list, monthly and yearly, so one PricePreview call returns both. */
export function paidPriceIds(tiers: readonly Tier[]): string[] {
  return tiers.flatMap((tier) => (tier.priceId ? [tier.priceId.month, tier.priceId.year] : []))
}
