import type { Ref } from 'vue'
import { shouldCloseSheet, swipeAxis, type SwipeAxis } from '~/utils/sheet-swipe'

/** Spring-back after a drag that did not close the sheet. */
const SPRING_BACK = 'transform 200ms ease-out'

/** A finger that rested this long (ms) before lifting has no flick speed. */
const STALE_MOVE_MS = 100

export interface SheetSwipe {
  onTouchstart: (event: TouchEvent) => void
  onTouchmove: (event: TouchEvent) => void
  onTouchend: (event: TouchEvent) => void
  onTouchcancel: () => void
  /** `@leave` hook of the sheet's Transition: slides a dragged sheet out from where the finger left it. */
  onLeave: (el: Element) => void
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * True when the touch starts inside content that is scrolled down, the sheet itself or a box inside
 * it (a long note field), so the finger scrolls that content back up and does not drag the sheet.
 */
function startsInScrolledContent(target: EventTarget | null, root: HTMLElement): boolean {
  let node = target instanceof Element ? target : null
  while (node && root.contains(node)) {
    if (node.scrollTop > 0) return true
    if (node === root) break
    node = node.parentElement
  }
  return false
}

/**
 * Swipe down to close a Bottom_Sheet. The sheet follows the finger down while its content is at the
 * top; a long enough drag or a flick closes it (`onClose`), anything shorter springs back. Sideways
 * swipes (carousels) and scrolling inside the content keep working, because only a gesture that
 * starts at the top and moves mainly down becomes a drag. The close button, the backdrop and Escape
 * stay the other ways to close.
 */
export function useSheetSwipe(sheet: Ref<HTMLElement | null>, onClose: () => void): SheetSwipe {
  let tracking = false
  let axis: SwipeAxis = null
  let startX = 0
  let startY = 0
  let offset = 0
  let lastY = 0
  let lastTime = 0
  let velocity = 0

  function setOffset(el: HTMLElement, px: number): void {
    offset = px
    el.style.transition = 'none'
    el.style.transform = `translateY(${px}px)`
  }

  function springBack(el: HTMLElement): void {
    offset = 0
    el.style.transition = prefersReducedMotion() ? 'none' : SPRING_BACK
    el.style.transform = ''
    const clear = (): void => {
      el.style.transition = ''
    }
    if (el.style.transition === 'none') clear()
    else el.addEventListener('transitionend', clear, { once: true })
  }

  function reset(): void {
    tracking = false
    axis = null
  }

  function onTouchstart(event: TouchEvent): void {
    const el = sheet.value
    const touch = event.touches[0]
    if (!el || !touch || event.touches.length !== 1 || startsInScrolledContent(event.target, el)) {
      reset()
      return
    }
    tracking = true
    axis = null
    startX = touch.clientX
    startY = touch.clientY
    lastY = touch.clientY
    lastTime = event.timeStamp
    velocity = 0
  }

  function onTouchmove(event: TouchEvent): void {
    const el = sheet.value
    const touch = event.touches[0]
    if (!tracking || !el || !touch) return
    if (event.touches.length !== 1) {
      if (axis === 'down') springBack(el)
      reset()
      return
    }
    const dx = touch.clientX - startX
    const dy = touch.clientY - startY

    if (axis === null) {
      axis = swipeAxis(dx, dy)
      if (axis === null) {
        // Below the slop: hold back the browser's own pull while this still looks like a drag down,
        // since some browsers ignore a cancel after they have started scrolling.
        if (dy > 0 && dy > Math.abs(dx) && el.scrollTop <= 0 && event.cancelable) event.preventDefault()
        return
      }
      if (axis === 'other' || el.scrollTop > 0) {
        reset()
        return
      }
    }

    if (event.cancelable) event.preventDefault()
    if (event.timeStamp > lastTime) velocity = (touch.clientY - lastY) / (event.timeStamp - lastTime)
    lastY = touch.clientY
    lastTime = event.timeStamp
    setOffset(el, Math.max(0, dy))
  }

  function onTouchend(event: TouchEvent): void {
    const el = sheet.value
    const dragged = tracking && axis === 'down'
    reset()
    if (!el || !dragged) return
    const speed = event.timeStamp - lastTime > STALE_MOVE_MS ? 0 : velocity
    if (shouldCloseSheet({ offset, velocity: speed, height: el.offsetHeight })) onClose()
    else springBack(el)
  }

  function onTouchcancel(): void {
    const el = sheet.value
    if (el && tracking && axis === 'down') springBack(el)
    reset()
  }

  function onLeave(el: Element): void {
    if (!(el instanceof HTMLElement)) return
    // The Transition's leave classes are in place: drop the drag's `transition: none` so they
    // animate. The drag offset stays on `transform`, and the leave class moves `translate`, so a
    // dragged sheet slides out from where the finger left it instead of jumping back first.
    el.style.transition = ''
    offset = 0
  }

  return { onTouchstart, onTouchmove, onTouchend, onTouchcancel, onLeave }
}
