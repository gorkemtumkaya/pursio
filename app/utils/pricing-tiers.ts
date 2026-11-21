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
  name: 'Free' | 'Plus' | 'Founding member'
  description: string
  features: string[]
  /**
   * Monthly and yearly Paddle price IDs of a subscription. `null` with no `oneTimePriceId`
   * is a free tier: its button goes to the app, not checkout.
   */
  priceId: { month: string; year: string } | null
  /** Paddle price ID of a single payment (founding membership). The billing toggle does not apply to it. */
  oneTimePriceId?: string
  /** A short line under the price, e.g. "First 50 only". */
  note?: string
  /** Highlights the card. The "MOST POPULAR" badge shows on it for yearly billing only. */
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
import { FOUNDING_PRICE_ID } from '#shared/utils/paddle-catalog'
export { FOUNDING_PRICE_ID }

/** The tiers with the price IDs of one Paddle environment. */
export function tiersFor(environment: Environments): readonly Tier[] {
  return [
    {
      name: 'Free',
      description: 'Everything you need to start a hobby.',
      features: ['3 active hobbies', 'Build skill paths for any hobby', 'Daily quests and progress tracking', 'No account needed to try it'],
      priceId: null,
      featured: false,
    },
    {
      name: 'Plus',
      description: 'For learners who want more from every path.',
      // Placeholder features: replace with what Plus actually unlocks.
      features: ['Unlimited hobbies', 'Everything in Free', 'Plus features as they ship, at no extra cost', 'Support an independent, open-source app'],
      priceId: PRICE_IDS[environment].plus,
      featured: true,
    },
    {
      name: 'Founding member',
      description: 'Back Pursio early. One payment, Plus for life.',
      features: [
        'Unlimited hobbies',
        'Lifetime Pursio Plus, with nothing more to pay',
        'Founder badge and the Founding Wick outfit',
        'A vote on which hobbies and features come next',
      ],
      priceId: null,
      oneTimePriceId: FOUNDING_PRICE_ID[environment],
      note: 'First 50 only',
      featured: false,
    },
  ]
}

/** Every paid price ID in the list (monthly, yearly and one-time), so one PricePreview call returns them all. */
export function paidPriceIds(tiers: readonly Tier[]): string[] {
  return tiers.flatMap((tier) => [
    ...(tier.priceId ? [tier.priceId.month, tier.priceId.year] : []),
    ...(tier.oneTimePriceId ? [tier.oneTimePriceId] : []),
  ])
}
