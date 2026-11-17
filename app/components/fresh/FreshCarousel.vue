<script setup lang="ts" generic="T">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { carouselArrows, carouselStep } from '~/utils/fresh-carousel'

/**
 * Horizontal row of cards (spec: fresh-v2, Req 6). The browser does the scrolling and the
 * snapping; script only shows and hides the arrow buttons, scrolls by one step and brings a
 * focused card into view. Card widths are fractions of the row, so about 1.6, 2.3 and 3.3
 * cards show per breakpoint and a partly visible card tells the row continues (Req 6.1).
 * The arrows show from `lg` up, and only while there is more to scroll in their direction
 * (Req 6.3). The row never scrolls the page sideways (Req 6.7).
 */
const props = defineProps<{
  items: readonly T[]
  itemKey: (item: T) => string
  /** The hobby, for the arrow names. */
  label: string
  /** Id of the heading that names the list (Req 4.5). */
  labelledBy: string
}>()

defineSlots<{ default(props: { item: T }): unknown }>()

const list = ref<HTMLUListElement | null>(null)
const prevButton = ref<HTMLButtonElement | null>(null)
const nextButton = ref<HTMLButtonElement | null>(null)
const arrows = ref({ prev: false, next: false })

let observer: ResizeObserver | null = null

function update(): void {
  const el = list.value
  if (!el) return
  const next = carouselArrows(el.scrollLeft, el.scrollWidth, el.clientWidth)
  // An arrow that hides while it has focus hands the focus to the other one.
  const active = document.activeElement
  if (!next.prev && active === prevButton.value && next.next) void nextTick(() => nextButton.value?.focus())
  if (!next.next && active === nextButton.value && next.prev) void nextTick(() => prevButton.value?.focus())
  arrows.value = next
}

/** `auto` (no animation) under `prefers-reduced-motion`, else `smooth` (Req 6.4). */
function scrollBehavior(): ScrollBehavior {
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduced ? 'auto' : 'smooth'
}

function step(direction: 1 | -1): void {
  const el = list.value
  const card = el?.querySelector('li')
  if (!el || !card) return
  const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0
  const left = direction * carouselStep(el.clientWidth, card.getBoundingClientRect().width, gap)
  el.scrollBy({ left, behavior: scrollBehavior() })
}

/** A focused card, or a control inside it, scrolls fully into view (Req 6.5). */
function onFocusIn(event: FocusEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const card = target.closest('li')
  if (!card || typeof card.scrollIntoView !== 'function') return
  card.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() })
}

onMounted(() => {
  const el = list.value
  if (!el) return
  el.addEventListener('scroll', update, { passive: true })
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(update)
    observer.observe(el)
  }
  update()
})

// Cards added or removed by a chip or mute change move the ends of the row.
watch(
  () => props.items.length,
  () => void nextTick(update),
)

onBeforeUnmount(() => {
  list.value?.removeEventListener('scroll', update)
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div class="relative min-w-0">
    <button
      v-show="arrows.prev"
      ref="prevButton"
      type="button"
      class="absolute top-1/2 left-0 z-10 hidden size-11 -translate-x-1/3 -translate-y-1/2 items-center justify-center rounded-full border-2 border-line bg-surface text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:flex"
      :aria-label="`Previous videos in ${label}`"
      @click="step(-1)"
    >
      <PathIcon name="chevron" class="size-5 rotate-90" />
    </button>
    <ul
      ref="list"
      :aria-labelledby="labelledBy"
      class="scrollbar-themed -m-1 flex snap-x snap-mandatory scroll-px-1 gap-3 overflow-x-auto overscroll-x-contain p-1 pb-3"
      @focusin="onFocusIn"
    >
      <li
        v-for="item in items"
        :key="itemKey(item)"
        class="w-[calc((100%-0.75rem)/1.6)] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/2.3)] lg:w-[calc((100%-2.25rem)/3.3)]"
      >
        <slot :item="item" />
      </li>
    </ul>
    <button
      v-show="arrows.next"
      ref="nextButton"
      type="button"
      class="absolute top-1/2 right-0 z-10 hidden size-11 translate-x-1/3 -translate-y-1/2 items-center justify-center rounded-full border-2 border-line bg-surface text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:flex"
      :aria-label="`Next videos in ${label}`"
      @click="step(1)"
    >
      <PathIcon name="chevron" class="size-5 -rotate-90" />
    </button>
  </div>
</template>
