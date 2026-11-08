<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useFocusTrap } from '~/composables/useFocusTrap'

/**
 * Mobile Node_Detail container (Req 8.1, 8.13, 8.14, 8.17). Teleported to
 * `<body>`, traps focus with initial focus on the close button, closes on
 * backdrop tap, close button and Escape, and locks body scroll while open.
 */
const props = defineProps<{ open: boolean; labelledBy: string }>()
const emit = defineEmits<{ close: [] }>()

const sheet = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLElement | null>(null)
const active = computed(() => props.open)

function close(): void {
  emit('close')
}

useFocusTrap(sheet, { active, initialFocus: closeButton, onEscape: close })

let previousOverflow: string | null = null

function lockScroll(): void {
  if (previousOverflow !== null) return
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
}

function unlockScroll(): void {
  if (previousOverflow === null) return
  document.body.style.overflow = previousOverflow
  previousOverflow = null
}

watch(
  active,
  (isOpen) => {
    if (!import.meta.client) return
    if (isOpen) lockScroll()
    else unlockScroll()
  },
  { immediate: true },
)

onBeforeUnmount(unlockScroll)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 motion-reduce:transition-none"
      leave-active-class="transition-opacity duration-200 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="open" aria-hidden="true" class="fixed inset-0 z-40 bg-overlay" @click="close" />
    </Transition>

    <Transition
      enter-active-class="transition-transform duration-300 ease-out motion-reduce:transition-none"
      leave-active-class="transition-transform duration-200 ease-in motion-reduce:transition-none"
      enter-from-class="translate-y-full"
      leave-to-class="translate-y-full"
    >
      <div
        v-if="open"
        ref="sheet"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="labelledBy"
        class="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-surface px-5 pt-2.5 pb-6"
      >
        <div aria-hidden="true" class="mb-1 flex justify-center">
          <span class="h-1.5 w-11 rounded-full bg-line" />
        </div>
        <button
          ref="closeButton"
          type="button"
          aria-label="Close"
          class="absolute top-5 right-5 flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          @click="close"
        >
          <PathIcon name="close" class="size-5" />
        </button>
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>
