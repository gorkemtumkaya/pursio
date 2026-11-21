/**
 * The tiers on /pricing. Edit names, text, features and price IDs here; the
 * page renders whatever this list holds, in order.
 *
 * Price IDs are from the Paddle **sandbox** catalog (product Premium,
 * pro_01m7yxc6q85jyxdnpnbd2k1wc9). Live has its own IDs: replace them before
 * setting NUXT_PUBLIC_PADDLE_ENV=production, or price previews fail with
 * "price not found".
 */
export interface Tier {
  name: 'Free' | 'Premium'
  description: string
  features: string[]
  /** Monthly and yearly Paddle price IDs. `null` is a free tier: its button goes to the app, not checkout. */
  priceId: { month: string; year: string } | null
  /** Highlights the card. */
  featured: boolean
}

export type BillingFrequency = 'month' | 'year'

export const TIERS: readonly Tier[] = [
  {
    name: 'Free',
    description: 'Everything you need to start a hobby.',
    features: ['Build skill paths for any hobby', 'Daily quests and progress tracking', 'No account needed to try it'],
    priceId: null,
    featured: false,
  },
  {
    name: 'Premium',
    description: 'For learners who want more from every path.',
    // Placeholder features: replace with what Premium actually unlocks.
    features: ['Everything in Free', 'Premium features as they ship', 'Support Pursio’s development'],
    priceId: {
      month: 'pri_01m7yxc793p1af7c9vnmqcmw3n',
      year: 'pri_01m7yxc7ekh0c4wb7xc24w7q69',
    },
    featured: true,
  },
]

/** Every paid price ID in the list, monthly and yearly, so one PricePreview call returns both. */
export function paidPriceIds(tiers: readonly Tier[]): string[] {
  return tiers.flatMap((tier) => (tier.priceId ? [tier.priceId.month, tier.priceId.year] : []))
}
