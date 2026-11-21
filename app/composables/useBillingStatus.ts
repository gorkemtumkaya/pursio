import type { BillingStatusResponse } from '#shared/types/billing'
import { bearerHeader } from '#shared/utils/auth'

/** One request at a time, shared by every caller. */
let inflight: Promise<void> | null = null

/**
 * The signed-in account's plan from `GET /api/billing/status`: paid access and
 * founding membership. Loaded once per page load for a signed-in account and
 * shared; a guest has none (`null`). A failed request also leaves `null`, so
 * callers treat "unknown" as "not a member".
 */
export function useBillingStatus() {
  const status = useState<BillingStatusResponse | null>('billing-status', () => null)
  const auth = useAuth()

  function load(force = false): Promise<void> {
    if (!import.meta.client || auth.status.value !== 'signed_in') return Promise.resolve()
    if (status.value !== null && !force) return Promise.resolve()
    inflight ??= (async () => {
      try {
        const token = await auth.accessToken()
        if (token === null) return
        const response = await $fetch<unknown>('/api/billing/status', { headers: bearerHeader(token), retry: 0 })
        if (typeof response === 'object' && response !== null && typeof (response as Record<string, unknown>).access === 'boolean') {
          status.value = response as BillingStatusResponse
        }
      } catch {
        // Left as it was: unknown.
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  watch(
    () => auth.status.value,
    (now) => {
      if (now === 'signed_in') void load()
      else status.value = null
    },
    { immediate: true },
  )

  const founding = computed(() => status.value?.founding === true)
  return { status: readonly(status), founding, load }
}
