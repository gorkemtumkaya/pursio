import type { Ref } from 'vue'
import type { SkillTree } from '#shared/types/skill-tree'
import type { ViewportClass } from '#shared/types/viewport'
import { computePathLayout } from '~/utils/path-layout'
import type { ElkLike, PathLayout } from '~/utils/path-layout'

export type PathLayoutStatus = 'loading' | 'ready' | 'error'

/** One elkjs instance per page load, created on first use. Cleared on failure so a later run can retry. */
let elkPromise: Promise<ElkLike> | null = null

function loadElk(): Promise<ElkLike> {
  if (!elkPromise) {
    elkPromise = import('elkjs/lib/elk.bundled.js')
      .then(({ default: ELK }) => new ELK())
      .catch((error: unknown) => {
        elkPromise = null
        throw error
      })
  }
  return elkPromise
}

/**
 * Path_Layout state for the Path_View. Stays `loading` while the viewport is
 * unknown (server and first client render) and while a run is pending
 * (Req 5.11). Recomputes when the viewport class changes (Req 5.13). Any
 * failure, including a failed elkjs import, yields `error` (Req 5.12).
 * A request token discards results from runs that a newer run replaced.
 */
export function usePathLayout(
  tree: SkillTree,
  viewport: Readonly<Ref<ViewportClass | null>>,
): {
  status: Readonly<Ref<PathLayoutStatus>>
  layout: Readonly<Ref<PathLayout | null>>
} {
  const status = ref<PathLayoutStatus>('loading')
  const layout = shallowRef<PathLayout | null>(null)
  let token = 0

  function fail(request: number, error: unknown): void {
    if (request !== token) return
    if (import.meta.dev) console.error('[usePathLayout] path could not be drawn', error)
    layout.value = null
    status.value = 'error'
  }

  async function run(viewportClass: ViewportClass, request: number): Promise<void> {
    try {
      const elk = await loadElk()
      if (request !== token) return
      const result = await computePathLayout(tree, viewportClass, elk)
      if (request !== token) return
      if (result.ok) {
        layout.value = result.value
        status.value = 'ready'
      }
      else {
        fail(request, result.errors)
      }
    }
    catch (error) {
      fail(request, error)
    }
  }

  watch(viewport, (viewportClass) => {
    const request = ++token
    status.value = 'loading'
    layout.value = null
    if (viewportClass === null || !import.meta.client) return
    void run(viewportClass, request)
  }, { immediate: true })

  onScopeDispose(() => {
    token++
  })

  return { status: readonly(status), layout: shallowReadonly(layout) }
}
