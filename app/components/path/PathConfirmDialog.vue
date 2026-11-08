<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useFocusTrap } from '~/composables/useFocusTrap'

/**
 * Confirmation for a destructive action. Teleported to `<body>` as a modal
 * alert dialog over `bg-overlay`, above the Bottom_Sheet. Focus starts on
 * Cancel; Escape and a backdrop tap cancel. On close, focus returns to the
 * element that was focused when it opened, if that element still exists.
 * `tone="danger"` colors the confirm button with the danger tokens. The
 * optional `media` slot sits above the title; `secondaryLabel` adds a text
 * button under the actions (e.g. "Archive instead").
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel: string
    tone?: 'default' | 'danger'
    secondaryLabel?: string
  }>(),
  { tone: 'default', secondaryLabel: undefined },
)
const emit = defineEmits<{ confirm: []; cancel: []; secondary: [] }>()

const card = ref<HTMLElement | null>(null)
const cancelButton = ref<HTMLElement | null>(null)
const active = computed(() => props.open)
const titleId = useId()
const messageId = useId()

function cancel(): void {
  emit('cancel')
}

useFocusTrap(card, { active, initialFocus: cancelButton, onEscape: cancel })

let opener: HTMLElement | null = null
watch(active, (isOpen) => {
  if (!import.meta.client) return
  if (isOpen) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return
  }
  const target = opener
  opener = null
  if (target?.isConnected) target.focus()
})

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 motion-reduce:transition-none"
      leave-active-class="transition-opacity duration-150 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-60 flex items-center justify-center bg-overlay p-5" @click.self="cancel">
        <div
          ref="card"
          role="alertdialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="messageId"
          class="flex w-full max-w-sm flex-col items-center gap-2 rounded-3xl bg-surface px-6 pt-6 pb-5 text-center shadow-raised-line"
        >
          <slot name="media" />
          <h2 :id="titleId" class="font-head text-2xl leading-tight font-semibold text-ink">{{ title }}</h2>
          <p :id="messageId" class="text-[15px] leading-normal text-muted">{{ message }}</p>
          <div class="mt-3 grid w-full grid-cols-2 gap-3">
            <button
              ref="cancelButton"
              type="button"
              :class="['h-12 rounded-2xl border-2 border-line bg-surface font-head text-base font-semibold text-ink', focusRing]"
              @click="cancel"
            >
              Cancel
            </button>
            <button
              type="button"
              :class="[
                'h-12 rounded-2xl font-head text-base font-semibold',
                focusRing,
                tone === 'danger'
                  ? 'bg-danger text-danger-ink shadow-raised-danger'
                  : 'bg-primary text-primary-ink shadow-raised-primary',
              ]"
              @click="emit('confirm')"
            >
              {{ confirmLabel }}
            </button>
          </div>
          <button
            v-if="secondaryLabel"
            type="button"
            :class="[
              'mt-1 flex h-11 items-center rounded-xl px-2 text-sm font-extrabold underline underline-offset-2',
              focusRing,
              tone === 'danger' ? 'text-danger-text' : 'text-accent-text',
            ]"
            @click="emit('secondary')"
          >
            {{ secondaryLabel }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
