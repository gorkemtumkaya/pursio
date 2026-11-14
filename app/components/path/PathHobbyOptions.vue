<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

/**
 * "⋯" menu button of one hobby card: Archive, Reset this path… (only when
 * `canReset`) and Delete…. Follows the menu
 * button pattern: Enter, Space and ArrowDown open on the first item, ArrowUp
 * on the last; ArrowUp/Down, Home and End move; Escape closes and refocuses
 * the button (without closing a surrounding sheet); Tab and outside clicks
 * close. On hover-capable devices the button shows only while its card
 * (`group`) is hovered or holds focus, unless `alwaysVisible`. The parent
 * positions the root (e.g. `absolute`), which also anchors the menu.
 */
const props = defineProps<{ hobby: string; alwaysVisible: boolean; canReset: boolean }>()
const emit = defineEmits<{ archive: []; reset: []; delete: [] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const menuId = useId()

function items(): HTMLElement[] {
  return Array.from(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
}

function focusItem(index: number): void {
  const list = items()
  if (list.length === 0) return
  list[(index + list.length) % list.length]?.focus()
}

async function openMenu(at: 'first' | 'last' = 'first'): Promise<void> {
  open.value = true
  await nextTick()
  focusItem(at === 'first' ? 0 : -1)
}

function closeMenu(refocus: boolean): void {
  open.value = false
  if (refocus) button.value?.focus()
}

function onButtonClick(): void {
  if (open.value) closeMenu(false)
  else void openMenu()
}

function onButtonKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    void openMenu(event.key === 'ArrowDown' ? 'first' : 'last')
  }
}

function onMenuKeydown(event: KeyboardEvent): void {
  const index = items().indexOf(document.activeElement as HTMLElement)
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      focusItem(index + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      focusItem(index - 1)
      break
    case 'Home':
      event.preventDefault()
      focusItem(0)
      break
    case 'End':
      event.preventDefault()
      focusItem(-1)
      break
    case 'Escape':
      // Stop here so a surrounding Bottom_Sheet stays open.
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
      break
    case 'Tab':
      closeMenu(false)
      break
  }
}

/** Refocus the button first, so a dialog opened by the action returns focus there. */
function choose(action: 'archive' | 'reset' | 'delete'): void {
  closeMenu(true)
  if (action === 'archive') emit('archive')
  else if (action === 'reset') emit('reset')
  else emit('delete')
}

function onOutsidePointer(event: PointerEvent): void {
  if (event.target instanceof Node && root.value?.contains(event.target)) return
  closeMenu(false)
}

watch(open, (isOpen) => {
  if (!import.meta.client) return
  if (isOpen) document.addEventListener('pointerdown', onOutsidePointer, true)
  else document.removeEventListener('pointerdown', onOutsidePointer, true)
})

onBeforeUnmount(() => {
  if (import.meta.client) document.removeEventListener('pointerdown', onOutsidePointer, true)
})

const itemClass =
  'flex h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[15px] font-extrabold whitespace-nowrap '
  + 'hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink'
</script>

<template>
  <div ref="root">
    <button
      ref="button"
      type="button"
      :aria-label="`Options for ${props.hobby}`"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? menuId : undefined"
      class="flex size-11 items-center justify-center rounded-xl text-muted transition-opacity hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      :class="
        open
          ? 'bg-surface-2 text-ink'
          : alwaysVisible
            ? ''
            : '[@media(hover:hover)]:group-[:not(:hover,:focus-within)]:opacity-0'
      "
      @click="onButtonClick"
      @keydown="onButtonKeydown"
    >
      <PathIcon name="more" class="size-5" />
    </button>
    <div
      v-if="open"
      :id="menuId"
      ref="menu"
      role="menu"
      :aria-label="`${props.hobby} options`"
      class="absolute top-full right-0 z-20 mt-1 flex min-w-40 flex-col rounded-2xl border-2 border-line bg-surface p-1.5 shadow-raised-line"
      @keydown="onMenuKeydown"
    >
      <button type="button" role="menuitem" tabindex="-1" :class="[itemClass, 'text-ink']" @click="choose('archive')">
        <PathIcon name="archive" class="size-4.5 shrink-0" />
        Archive
      </button>
      <button v-if="canReset" type="button" role="menuitem" tabindex="-1" :class="[itemClass, 'text-ink']" @click="choose('reset')">
        <PathIcon name="reset" class="size-4.5 shrink-0" />
        Reset this path…
      </button>
      <div role="separator" class="mx-2 my-1 h-0.5 rounded-full bg-line" />
      <button type="button" role="menuitem" tabindex="-1" :class="[itemClass, 'text-danger-text']" @click="choose('delete')">
        <PathIcon name="trash" class="size-4.5 shrink-0" />
        Delete…
      </button>
    </div>
  </div>
</template>
