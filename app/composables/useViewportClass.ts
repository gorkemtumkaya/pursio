import type { Ref } from 'vue'
import type { ViewportClass } from '#shared/types/viewport'

const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * Viewport class from the 1024 px breakpoint. `null` on the server and on
 * the first client render (so hydration matches), then follows the media
 * query until the calling component unmounts.
 */
export function useViewportClass(): Readonly<Ref<ViewportClass | null>> {
  const viewport = ref<ViewportClass | null>(null)
  let query: MediaQueryList | null = null

  function apply(matches: boolean): void {
    viewport.value = matches ? 'desktop' : 'mobile'
  }

  function onChange(event: MediaQueryListEvent): void {
    apply(event.matches)
  }

  onMounted(() => {
    query = window.matchMedia(DESKTOP_QUERY)
    apply(query.matches)
    query.addEventListener('change', onChange)
  })

  onBeforeUnmount(() => {
    query?.removeEventListener('change', onChange)
    query = null
  })

  return readonly(viewport)
}
