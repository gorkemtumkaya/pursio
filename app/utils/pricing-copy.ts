// Text of /pricing and /welcome (Paddle checkout).

export const PRICING_COPY = {
  title: 'Pricing',
  heading: 'Pick your plan',
  intro: 'Start free. Upgrade when you want more.',
  frequencyLabel: 'Billing period',
  monthly: 'Monthly',
  yearly: 'Yearly',
  perMonth: '/month',
  perYear: '/year',
  freePrice: 'Free',
  freeCta: 'Start free',
  subscribeCta: 'Subscribe',
  comingSoonCta: 'Coming soon',
  checkoutClosedNote: 'Plus opens soon. These are the prices it will have; subscribing isn’t open yet.',
  loading: '…',
  pricesFailed: "We couldn't load prices. Reload the page to try again.",
  checkoutFailed: "Checkout couldn't open. Reload the page and try again.",
  featuredBadge: 'MOST POPULAR',
  // taxNote: 'Prices are shown in your local currency. Tax is calculated for your country at checkout.',
  taxNote: 'Tax is calculated for your country at checkout.',
  welcomeTitle: 'Welcome to Plus',
  welcomeText: 'Thanks for subscribing. Paddle has emailed you the details of your subscription.',
  welcomeCta: 'Back to Pursio',
} as const

export function trialLabel(days: number): string {
  return `${days}-day free trial`
}
