import { readonly } from 'vue'

export interface ToastAction {
  label: string
  run: () => void
}

export interface Toast {
  /** Changes for every new toast, so the timer restarts even when the text repeats. */
  id: number
  message: string
  action: ToastAction | null
}

/** How long a toast stays before it hides itself (paused while hovered or focused). */
export const TOAST_DURATION_MS = 5000

let nextId = 0

/**
 * One app-wide toast, rendered by `AppToast` in `app.vue`, so it survives page
 * changes (e.g. deleting the open path navigates away). Only set on the client,
 * from event handlers; SSR always renders none.
 */
export function useToast() {
  const toast = useState<Toast | null>('pursio-toast', () => null)

  function show(message: string, action: ToastAction | null = null): void {
    nextId += 1
    toast.value = { id: nextId, message, action }
  }

  /** Hides the toast; with an id, only if that toast is still the one shown. */
  function dismiss(id?: number): void {
    if (id === undefined || toast.value?.id === id) toast.value = null
  }

  return { toast: readonly(toast), show, dismiss }
}
