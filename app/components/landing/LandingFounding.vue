<script setup lang="ts">
// Founding members section (design: dev_docs "Landing page"): the offer card
// and the "follow along" card. Owner decision, 2026-11-21: the waitlist is gone
// from the offer card. "Become a founding member" opens Paddle Checkout for the
// one-time founding price; a guest signs in first, so the purchase belongs to
// an account. The first 50 limit is asked from GET /api/founding/availability on
// load and again right before checkout opens; a member sees "You're a founding member".
// A guest's click is remembered in the URL (?founding=checkout), which both sign-in
// ways return to, so checkout opens by itself once they come back signed in.
// The "follow along" form still stores an email through POST /api/waitlist.
import type { CheckoutOpenOptions } from '@paddle/paddle-js'
import { FOUNDING_PERKS, LANDING_COPY } from '~/utils/landing-copy'
import { checkoutEnabled } from '~/utils/paddle-config'
import { FOUNDING_PRICE_ID } from '~/utils/pricing-tiers'

const headingId = 'landing-founding-heading'

const config = useRuntimeConfig().public
const auth = useAuth()
const dialog = useAuthDialog()
const { load } = usePaddle()
const billing = useBillingStatus()
const route = useRoute()
const router = useRouter()

/** Query flag that carries "this visitor wanted to become a founding member" through sign-in. */
const INTENT_KEY = 'founding'
const INTENT_VALUE = 'checkout'
/**
 * True only when the page was opened with the flag, i.e. on the way back from
 * sign-in. The tab where the guest clicked gets the flag later and so never
 * opens checkout by itself, which avoids two checkouts when a magic link opens a new tab.
 */
const returnedToBuy = route.query[INTENT_KEY] === INTENT_VALUE

function intentQuery(on: boolean) {
  const { [INTENT_KEY]: _dropped, ...rest } = route.query
  return on ? { ...rest, [INTENT_KEY]: INTENT_VALUE } : rest
}

/** NUXT_PUBLIC_PADDLE_CHECKOUT_ENABLED: off shows a disabled "Opening soon" button. */
const canCheckout = checkoutEnabled(config.paddleCheckoutEnabled)
const busy = ref(false)
const failed = ref(false)
/** False once the first 50 are sold. Stays true while unknown, so a failed check never hides the offer. */
const available = ref(true)

/** Asks the server whether a spot is left. A failed request keeps the last answer. */
async function checkAvailability(): Promise<void> {
  try {
    const response = await $fetch<unknown>('/api/founding/availability', { retry: 0 })
    const value: unknown = typeof response === 'object' && response !== null ? (response as Record<string, unknown>).available : undefined
    if (typeof value === 'boolean') available.value = value
  } catch {
    // Unknown: keep the last answer.
  }
}

onMounted(() => void checkAvailability())

async function becomeFoundingMember(): Promise<void> {
  if (!canCheckout || busy.value) return
  failed.value = false
  // A guest signs in first. `save` keeps their anonymous paths and adds the email to them.
  if (auth.status.value !== 'signed_in') {
    // Both sign-in ways come back to the current URL, so the flag survives the round trip.
    await router.replace({ query: intentQuery(true), hash: route.hash })
    dialog.show('save')
    return
  }
  busy.value = true
  try {
    // Ask again right before paying: the last spot may have gone since the page loaded,
    // and this account may already be a member.
    await Promise.all([checkAvailability(), billing.load(true)])
    if (!available.value || billing.founding.value) return
    const paddle = await load()
    // load() has already rejected an unset or unknown NUXT_PUBLIC_PADDLE_ENV.
    const priceId = FOUNDING_PRICE_ID[config.paddleEnv === 'production' ? 'production' : 'sandbox']
    const options: CheckoutOpenOptions = {
      items: [{ priceId, quantity: 1 }],
      settings: {
        displayMode: 'overlay',
        variant: 'one-page',
        successUrl: new URL('/welcome?founding=1', window.location.origin).href,
      },
      // Links the purchase to the Pursio account in the webhook mirror.
      customData: { pursioUserId: auth.userId.value },
    }
    if (auth.email.value !== '') options.customer = { email: auth.email.value }
    paddle.Checkout.open(options)
  } catch (error) {
    console.error('[paddle] founding Checkout.open failed', error)
    failed.value = true
  } finally {
    busy.value = false
  }
}

// Back from sign-in with the flag: drop it from the URL and open checkout once.
if (returnedToBuy) {
  const stop = watch(
    () => auth.status.value,
    (status) => {
      if (status !== 'signed_in') return
      // `stop` is not assigned yet when the first run is the immediate one.
      queueMicrotask(() => stop())
      void router.replace({ query: intentQuery(false), hash: route.hash }).then(() => becomeFoundingMember())
    },
    { immediate: true },
  )
}

const BUTTON =
  'h-[60px] w-full rounded-[18px] font-head text-xl font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary'
</script>

<template>
  <section
    id="founding"
    :aria-labelledby="headingId"
    class="mx-auto flex w-full max-w-[1160px] flex-wrap items-stretch gap-5 px-4 py-7 min-[700px]:px-8 min-[700px]:py-12"
  >
    <div
      class="flex min-w-0 flex-[3_1_420px] flex-col gap-4 rounded-4xl border-2 border-ink bg-surface p-[22px] shadow-[0_8px_0_var(--pursio-ink)] min-[700px]:p-9"
    >
      <span
        class="self-start rounded-[10px] bg-gold px-3 py-1.5 text-[13px] font-extrabold tracking-[0.04em] text-gold-ink"
      >
        {{ LANDING_COPY.foundingBadge }}
      </span>
      <h2 :id="headingId" class="font-display text-[28px] leading-[1.1] font-semibold text-ink min-[700px]:text-[40px]">
        {{ LANDING_COPY.foundingHeading }}
      </h2>
      <p class="flex flex-wrap items-baseline gap-2.5">
        <span class="font-display text-[56px] leading-none font-semibold text-ink">{{ LANDING_COPY.foundingPrice }}</span>
        <span class="text-base font-extrabold text-ink">{{ LANDING_COPY.foundingPriceUnit }}</span>
      </p>
      <p class="text-[15px] font-bold text-muted">{{ LANDING_COPY.foundingPriceLater }}</p>
      <ul class="flex flex-col gap-2.5">
        <li
          v-for="perk in FOUNDING_PERKS"
          :key="perk"
          class="flex items-start gap-3 text-base leading-[1.4] font-bold text-ink"
        >
          <span
            aria-hidden="true"
            class="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-done text-done-ink"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <span>{{ perk }}</span>
        </li>
      </ul>
      <p v-if="billing.founding.value" role="status" class="rounded-2xl border-2 border-done bg-surface p-4 text-base font-extrabold text-ink">
        {{ LANDING_COPY.foundingMember }}
      </p>
      <button v-else-if="!available" type="button" disabled :class="[BUTTON, 'cursor-not-allowed border-2 border-line bg-surface text-muted']">
        {{ LANDING_COPY.foundingSoldOut }}
      </button>
      <button
        v-else-if="canCheckout"
        type="button"
        :aria-disabled="busy ? 'true' : undefined"
        :class="[BUTTON, 'cursor-pointer bg-primary text-primary-ink shadow-[0_5px_0_var(--pursio-primary-deep)] aria-disabled:opacity-70']"
        @click="becomeFoundingMember"
      >
        {{ LANDING_COPY.foundingCta }}
      </button>
      <button v-else type="button" disabled :class="[BUTTON, 'cursor-not-allowed border-2 border-line bg-surface text-muted']">
        {{ LANDING_COPY.foundingClosedCta }}
      </button>
      <p v-if="failed" role="alert" class="text-sm font-bold text-danger-text">{{ LANDING_COPY.foundingFailed }}</p>
      <p class="text-sm leading-normal text-muted">{{ LANDING_COPY.foundingNote }}</p>
      <NuxtLink
        to="/pricing"
        class="inline-flex min-h-11 items-center self-start rounded-lg text-[15px] font-extrabold text-accent-text underline underline-offset-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {{ LANDING_COPY.foundingSeePlans }}
      </NuxtLink>
    </div>

    <div
      class="flex min-w-0 flex-[2_1_300px] flex-col justify-center gap-3.5 rounded-4xl bg-surface-2 p-[22px] min-[700px]:p-9"
    >
      <h3 class="font-head text-2xl leading-[1.15] font-semibold text-ink">{{ LANDING_COPY.followHeading }}</h3>
      <p class="text-[15px] leading-normal text-muted">{{ LANDING_COPY.followText }}</p>
      <LandingWaitlistForm kind="updates" :cta="LANDING_COPY.followCta" :done="LANDING_COPY.followDone" />
    </div>
  </section>
</template>
