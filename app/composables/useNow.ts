import type { Ref } from 'vue'

const TICK_MS = 15_000

/**
 * Epoch ms that updates every 15 s and on tab focus/visibility, so the day,
 * the week and "RESETS IN" follow the real time. The interval and listeners
 * start in `onMounted` and stop in `onBeforeUnmount`.
 */
export function useNow(): Readonly<Ref<number>> {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null

  function refresh(): void {
    now.value = Date.now()
  }

  onMounted(() => {
    refresh()
    timer = setInterval(refresh, TICK_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
  })

  onBeforeUnmount(() => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    window.removeEventListener('focus', refresh)
    document.removeEventListener('visibilitychange', refresh)
  })

  return readonly(now)
}
