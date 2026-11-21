<script setup lang="ts">
import type { CheckoutOpenOptions } from '@paddle/paddle-js'
import { checkoutEnabled } from '~/utils/paddle-config'
import { formattedTotals, pricePreviewParams, trialDays, type FormattedPrices } from '~/utils/paddle-pricing'
import { PRICING_COPY } from '~/utils/pricing-copy'
import { paidPriceIds, tiersFor, type BillingFrequency, type Tier } from '~/utils/pricing-tiers'

/**
 * Tier cards with localized prices (Paddle.PricePreview) and Paddle Checkout.
 * `country` comes from the request header on the server; UNKNOWN_COUNTRY
 * means no address is sent and Paddle locates the visitor by IP.
 */
const props = defineProps<{ country: string }>()

const { load } = usePaddle()
// Price IDs follow NUXT_PUBLIC_PADDLE_ENV. An unset or unknown value still draws the
// cards (with the sandbox set), but load() throws before any ID is sent to Paddle.
const TIERS = tiersFor(useRuntimeConfig().public.paddleEnv === 'production' ? 'production' : 'sandbox')
const canCheckout = checkoutEnabled(useRuntimeConfig().public.paddleCheckoutEnabled)
const auth = useAuth()
// The founding tier's button opens the same checkout as the landing page's founding card.
const founding = useFoundingCheckout()
const foundingState = computed(() => (founding.founding.value ? 'member' : founding.available.value ? 'open' : 'sold_out'))

/** The price ID a tier shows now: its one-time price, or the monthly or yearly one. */
function shownPriceId(tier: Tier): string | undefined {
  return tier.oneTimePriceId ?? tier.priceId?.[frequency.value]
}
function shown<T>(tier: Tier, values: Record<string, T>): T | undefined {
  const id = shownPriceId(tier)
  return id === undefined ? undefined : values[id]
}

const frequency = ref<BillingFrequency>('month')
const prices = ref<FormattedPrices>({})
const trials = ref<Record<string, number>>({})
const pricesFailed = ref(false)
const checkoutFailed = ref(false)

// One call fetches monthly and yearly prices, so the toggle needs no new request.
async function fetchPrices(country: string): Promise<void> {
  pricesFailed.value = false
  try {
    const paddle = await load()
    const response = await paddle.PricePreview(pricePreviewParams(paidPriceIds(TIERS), country))
    prices.value = formattedTotals(response)
    trials.value = trialDays(response)
  } catch (error) {
    console.error('[paddle] PricePreview failed', error)
    pricesFailed.value = true
  }
}

onMounted(() => void fetchPrices(props.country))

async function subscribe(priceId: string): Promise<void> {
  if (!canCheckout) return
  checkoutFailed.value = false
  try {
    const paddle = await load()
    const options: CheckoutOpenOptions = {
      items: [{ priceId, quantity: 1 }],
      settings: {
        displayMode: 'overlay',
        variant: 'one-page',
        successUrl: new URL('/welcome', window.location.origin).href,
      },
    }
    // Prefill only a signed-in account's email; anonymous sessions have none.
    if (auth.email.value !== '') options.customer = { email: auth.email.value }
    // Lets a webhook link the subscription to the Pursio account later.
    if (auth.userId.value !== '') options.customData = { pursioUserId: auth.userId.value }
    paddle.Checkout.open(options)
  } catch (error) {
    console.error('[paddle] Checkout.open failed', error)
    checkoutFailed.value = true
  }
}
</script>

<template>
  <div class="flex flex-col items-center gap-8">
    <PricingFrequencyToggle v-model="frequency" />
    <p v-if="pricesFailed || checkoutFailed || founding.failed.value" role="alert" class="text-base font-bold text-danger-text">
      {{ pricesFailed ? PRICING_COPY.pricesFailed : PRICING_COPY.checkoutFailed }}
    </p>
    <div class="flex w-full flex-wrap items-stretch justify-center gap-5">
      <PricingTierCard
        v-for="tier in TIERS"
        :key="tier.name"
        :tier="tier"
        :frequency="frequency"
        :price="shown(tier, prices)"
        :trial-days="shown(tier, trials)"
        :checkout-enabled="canCheckout"
        :founding-state="foundingState"
        @founding="founding.open"
        class="max-w-[440px]"
        @subscribe="subscribe"
      />
    </div>
    <p v-if="!canCheckout" class="max-w-[560px] text-center text-base font-bold text-ink">{{ PRICING_COPY.checkoutClosedNote }}</p>
    <p class="max-w-[560px] text-center text-sm leading-normal text-muted">{{ PRICING_COPY.taxNote }}</p>
  </div>
</template>
