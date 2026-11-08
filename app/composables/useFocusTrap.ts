import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

export interface FocusTrapOptions {
  active: Ref<boolean>
  initialFocus: Ref<HTMLElement | null>
  onEscape?: () => void
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Focusable elements inside `root`, in DOM order, skipping hidden ones. */
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0,
  )
}

/**
 * Keeps keyboard focus inside `container` while `active` is true.
 * Focuses `initialFocus` on activation, wraps Tab and Shift+Tab at the ends,
 * and calls `onEscape` on Escape. Focusables are read at keypress time,
 * so content that changes while the trap is active is handled.
 */
export function useFocusTrap(container: Ref<HTMLElement | null>, options: FocusTrapOptions): void {
  const { active, initialFocus, onEscape } = options

  function onKeydown(event: KeyboardEvent): void {
    if (!active.value) return
    const root = container.value
    if (!root) return

    if (event.key === 'Escape') {
      if (onEscape) {
        event.preventDefault()
        event.stopPropagation()
        onEscape()
      }
      return
    }

    if (event.key !== 'Tab') return
    const focusables = focusablesIn(root)
    if (focusables.length === 0) {
      event.preventDefault()
      return
    }
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!
    const current = document.activeElement
    const inside = current instanceof Node && root.contains(current)

    if (event.shiftKey) {
      if (!inside || current === first) {
        event.preventDefault()
        last.focus()
      }
    } else if (!inside || current === last) {
      event.preventDefault()
      first.focus()
    }
  }

  watch(
    container,
    (el, previous) => {
      previous?.removeEventListener('keydown', onKeydown)
      el?.addEventListener('keydown', onKeydown)
    },
    { immediate: true, flush: 'post' },
  )

  watch(
    active,
    async (isActive) => {
      if (!isActive || !import.meta.client) return
      // Wait for the opened content (and its Teleport) to render before focusing.
      await nextTick()
      if (active.value) initialFocus.value?.focus()
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(() => {
    container.value?.removeEventListener('keydown', onKeydown)
  })
}
