import { bearerHeader } from '#shared/utils/auth'

/**
 * Paddle Retain (payment recovery and cancellation flows) needs Paddle.js on the
 * app's pages with `pwCustomer` set to the customer's Paddle id. For a signed-in
 * account that has a Paddle customer, this asks the server for that id once per
 * page load and loads Paddle.js with it. Guests and accounts that never bought
 * load nothing.
 */
export default defineNuxtPlugin(() => {
  const auth = useAuth()
  const paddle = usePaddle()
  let done = false

  async function attach(): Promise<void> {
    if (done) return
    done = true
    try {
      const token = await auth.accessToken()
      if (token === null) return
      const response = await $fetch<unknown>('/api/billing/status', { headers: bearerHeader(token), retry: 0 })
      const id: unknown = typeof response === 'object' && response !== null ? (response as Record<string, unknown>).customerId : null
      if (typeof id !== 'string' || !/^ctm_[a-z\d]+$/.test(id)) return
      paddle.setCustomer(id)
      await paddle.load()
    } catch {
      // Retain is optional: a failed lookup or a missing Paddle config never breaks the page.
    }
  }

  watch(
    () => auth.status.value,
    (status) => {
      if (status === 'signed_in') void attach()
    },
    { immediate: true },
  )
})
