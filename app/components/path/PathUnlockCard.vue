<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useFocusTrap } from '~/composables/useFocusTrap'

/**
 * Unlock_Moment card (Req 9.3, 9.4, 9.6). Teleported to `<body>` as a modal
 * dialog over `bg-overlay`. Rendered while `open` is true; it stays until the
 * user activates Continue: no Escape, backdrop or automatic dismissal. Focus
 * moves to Continue on open and Tab wraps inside the card.
 */
const props = defineProps<{
  open: boolean
  completedTitle: string
  nextTitle: string | null
}>()
const emit = defineEmits<{ continue: [] }>()

const card = ref<HTMLElement | null>(null)
const continueButton = ref<HTMLElement | null>(null)
const active = computed(() => props.open)
const titleId = useId()

// No onEscape: Escape does nothing while the card is open (Req 9.4).
useFocusTrap(card, { active, initialFocus: continueButton })
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 motion-reduce:transition-none"
      leave-active-class="transition-opacity duration-150 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-60 flex items-center justify-center bg-overlay p-5">
        <div
          ref="card"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          class="flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl bg-surface px-6 pt-8 pb-6 text-center"
        >
          <span
            aria-hidden="true"
            class="mb-2 flex size-21 items-center justify-center rounded-node bg-done text-done-ink shadow-raised-done"
          >
            <PathIcon name="check" class="size-10" />
          </span>
          <span class="font-display text-4xl font-bold text-accent-text">+50 XP</span>
          <h2 :id="titleId" class="font-body text-2xl font-extrabold text-ink">
            {{ completedTitle }} complete
          </h2>
          <template v-if="nextTitle !== null">
            <p class="font-body text-base text-muted">New skill unlocked on your path</p>
            <p
              class="flex items-center gap-2 rounded-2xl border-2 border-dashed border-primary px-3.5 py-2.5 font-body text-base font-extrabold text-ink"
            >
              <PathIcon name="star" class="size-4.5 shrink-0 text-primary" />
              <span>Next: {{ nextTitle }}</span>
            </p>
          </template>
          <p v-else class="font-body text-base font-extrabold text-ink">Path complete</p>
          <button
            ref="continueButton"
            type="button"
            class="mt-2 h-14 min-h-11 w-full rounded-2xl bg-primary font-head text-lg font-semibold text-primary-ink shadow-raised-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            @click="emit('continue')"
          >
            Continue
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
