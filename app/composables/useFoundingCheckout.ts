import type { CheckoutOpenOptions } from '@paddle/paddle-js'
import { checkoutEnabled } from '~/utils/paddle-config'
import { FOUNDING_PRICE_ID } from '~/utils/pricing-tiers'

/**
 * The founding checkout, shared by the landing page's founding card and the hobby
 * limit card. "Become a founding member" opens Paddle Checkout for the one-time
 * founding price; a guest signs in first, so the purchase belongs to an account.
 * The first 50 limit is asked from GET /api/founding/availability on load and again
 * right before checkout opens. A guest's click is remembered in the URL
 * (?founding=checkout), which both sign-in ways return to, so checkout opens by
 * itself once they come back signed in. Use it once per page.
 */
export function useFoundingCheckout() {
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

  return {
    /** NUXT_PUBLIC_PADDLE_CHECKOUT_ENABLED. */
    canCheckout,
    /** False once the first 50 are sold; true while unknown. */
    available: readonly(available),
    busy: readonly(busy),
    failed: readonly(failed),
    /** Whether this account already is a founding member. */
    founding: billing.founding,
    open: becomeFoundingMember,
  }
}
