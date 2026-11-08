<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { TOAST_DURATION_MS, useToast } from '~/composables/useToast'

/**
 * App-wide toast from `useToast`. The live region is always rendered so screen
 * readers announce new messages. A toast hides after TOAST_DURATION_MS; the
 * timer pauses while it is hovered or holds focus, so there is time to reach
 * the action. On mobile it sits above the bottom navigation and the
 * Bottom_Sheet; on desktop at the bottom of the sidebar column. Below dialogs.
 */
const { toast, dismiss } = useToast()

let timer: ReturnType<typeof setTimeout> | null = null
let remaining = TOAST_DURATION_MS
let startedAt = 0
let hovered = false
let focused = false

function stopTimer(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

function startTimer(): void {
  stopTimer()
  const id = toast.value?.id
  if (id === undefined || hovered || focused) return
  startedAt = Date.now()
  timer = setTimeout(() => dismiss(id), remaining)
}

function pause(): void {
  if (timer === null) return
  stopTimer()
  remaining = Math.max(0, remaining - (Date.now() - startedAt))
}

function setHovered(value: boolean): void {
  hovered = value
  if (value) pause()
  else startTimer()
}

function setFocused(value: boolean): void {
  focused = value
  if (value) pause()
  else startTimer()
}

watch(
  () => toast.value?.id,
  (id) => {
    stopTimer()
    remaining = TOAST_DURATION_MS
    hovered = false
    focused = false
    if (id !== undefined) startTimer()
  },
)

onBeforeUnmount(stopTimer)

function runAction(): void {
  const current = toast.value
  if (!current?.action) return
  dismiss(current.id)
  current.action.run()
}
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="pointer-events-none fixed inset-x-0 bottom-24 z-55 flex justify-center px-4 lg:right-auto lg:bottom-5 lg:left-5 lg:w-52 lg:px-0"
  >
    <Transition
      enter-active-class="transition duration-200 motion-reduce:transition-none"
      leave-active-class="transition duration-150 motion-reduce:transition-none"
      enter-from-class="translate-y-2 opacity-0"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="toast"
        :key="toast.id"
        class="pointer-events-auto flex w-full max-w-md items-center justify-between gap-2 rounded-2xl bg-ink py-0.5 pr-1 pl-4 text-bg"
        @mouseenter="setHovered(true)"
        @mouseleave="setHovered(false)"
        @focusin="setFocused(true)"
        @focusout="setFocused(false)"
      >
        <span class="min-w-0 py-3 text-sm font-extrabold">{{ toast.message }}</span>
        <button
          v-if="toast.action"
          type="button"
          class="group flex h-11 shrink-0 items-center rounded-xl px-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-bg"
          @click="runAction"
        >
          <span class="rounded-lg bg-surface px-3 py-1.5 text-xs font-extrabold text-ink group-hover:bg-surface-2">
            {{ toast.action.label }}
          </span>
        </button>
      </div>
    </Transition>
  </div>
</template>
