import { computed, ref } from 'vue'
import type { ResetMode, ResetScope, ResetSnapshot } from '#shared/types/cloud'
import { UNDO_WINDOW_MS } from '~/utils/progress-reset'
import { CLOUD_MESSAGES } from './useCloudStore'

export type ResetTarget = { scope: Extract<ResetScope, 'path'>; id: string; hobby: string } | { scope: Extract<ResetScope, 'all'> }

/**
 * Dialog state of the reset-progress dialog (spec: reset-progress). Plain refs
 * per call, no global state: the Path_Page and the Settings_Page each call it.
 */
export function useProgressReset() {
  const cloud = useCloudStore()
  const toast = useToast()

  const open = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const mode = ref<ResetMode>('keep_history')
  /** Kept after closing so the leave transition shows no placeholder title. */
  const target = ref<ResetTarget>({ scope: 'all' })
  const pathCount = computed(() => cloud.paths.value.length)

  function askReset(next: ResetTarget): void {
    target.value = next
    mode.value = 'keep_history'
    error.value = null
    open.value = true
  }

  function cancelReset(): void {
    if (busy.value) return
    open.value = false
  }

  function setMode(next: ResetMode): void {
    if (busy.value) return
    mode.value = next
    error.value = null
  }

  /** Runs from the app-wide toast, possibly after the page was left: it only uses the store and the toast. */
  async function undo(snapshot: ResetSnapshot): Promise<void> {
    if (await cloud.undoReset(snapshot)) toast.show('Progress restored')
  }

  function showUndo(t: ResetTarget, snapshot: ResetSnapshot | null): void {
    const message = t.scope === 'path' ? `${t.hobby} progress reset` : 'All progress reset'
    // The snapshot lives only in this closure; a replaced or expired toast drops it.
    toast.show(message, snapshot ? { label: 'Undo', run: () => void undo(snapshot) } : null, { durationMs: UNDO_WINDOW_MS })
  }

  /** Resolves true when the reset succeeded, so the page can restore focus. */
  async function confirmReset(): Promise<boolean> {
    if (busy.value) return false
    busy.value = true
    error.value = null
    const t = target.value
    const result = await cloud.resetProgress(t.scope, mode.value, t.scope === 'path' ? t.id : undefined)
    busy.value = false
    if (!result) {
      error.value = CLOUD_MESSAGES.resetFailed
      return false
    }
    open.value = false
    showUndo(t, result.snapshot)
    return true
  }

  return { open, busy, error, mode, target, pathCount, askReset, cancelReset, setMode, confirmReset }
}
