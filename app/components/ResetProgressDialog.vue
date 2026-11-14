<script setup lang="ts">
import { useId } from 'vue'
import type { ResetMode, ResetScope } from '#shared/types/cloud'
import { resetModeDescription } from '~/utils/progress-reset'

/**
 * The "Reset progress" confirmation, driven by `useProgressReset`
 * (spec: reset-progress, Req 3.1 to 3.3, 7.1, 7.2, 7.4, 7.5, 9.5, 12.1).
 * `PathConfirmDialog` as a `dialog` with a two-way mode choice in its default slot.
 */
defineProps<{
  open: boolean
  scope: ResetScope
  /** Hobby name for the scope 'path'. */
  hobby: string | null
  /** Number of paths for the scope 'all'. */
  pathCount: number
  mode: ResetMode
  busy: boolean
  error: string | null
}>()
const emit = defineEmits<{ confirm: []; cancel: []; 'update:mode': [mode: ResetMode] }>()

const MODES: readonly { value: ResetMode; label: string }[] = [
  { value: 'keep_history', label: 'Keep activity history' },
  { value: 'wipe', label: 'Wipe everything' },
]
const groupName = `reset-mode-${useId()}`
</script>

<template>
  <PathConfirmDialog
    :open="open"
    role="dialog"
    :title="scope === 'path' ? `Reset your ${hobby ?? ''} path?` : 'Reset all your progress?'"
    :message="
      scope === 'path'
        ? 'Your skill tree stays. Choose what happens to your progress.'
        : `This resets ${pathCount} ${pathCount === 1 ? 'path' : 'paths'}, archived ones included. Your skill trees stay.`
    "
    :confirm-label="scope === 'path' ? 'Reset path' : 'Reset all progress'"
    tone="danger"
    :busy="busy"
    :error="error"
    @confirm="emit('confirm')"
    @cancel="emit('cancel')"
  >
    <fieldset :disabled="busy" class="mt-1 flex w-full flex-col gap-2 text-left">
      <legend class="sr-only">What should be reset?</legend>
      <label
        v-for="m in MODES"
        :key="m.value"
        class="flex cursor-pointer flex-col gap-0.5 rounded-2xl border-2 border-line bg-bg px-4 py-3 text-ink has-checked:border-ink has-disabled:cursor-default has-disabled:opacity-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
      >
        <input
          type="radio"
          :name="groupName"
          :value="m.value"
          :checked="mode === m.value"
          class="sr-only"
          @change="emit('update:mode', m.value)"
        >
        <span class="text-sm font-extrabold">{{ m.label }}</span>
        <span class="text-sm leading-snug text-muted">{{ resetModeDescription(scope, m.value) }}</span>
      </label>
    </fieldset>
  </PathConfirmDialog>
</template>
