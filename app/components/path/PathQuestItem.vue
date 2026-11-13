<script setup lang="ts">
/**
 * One quest checkbox in the Node_Detail (Req 8.6–8.8, 13.8).
 * Optional `subtitle`, `badge` and `ariaLabel` serve the Quests page (Req 5.2, 15.6).
 */
defineProps<{
  text: string
  checked: boolean
  /** Second line under the quest text, e.g. the skill title. */
  subtitle?: string
  /** Small pill at the end of the row, e.g. "+10 XP". */
  badge?: string
  /** Accessible name of the checkbox; falls back to the visible text. */
  ariaLabel?: string
}>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <label
    class="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-surface px-3 py-2 text-[15px] font-bold has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ink"
  >
    <input type="checkbox" class="sr-only" :checked="checked" :aria-label="ariaLabel" @change="emit('toggle')" />
    <span
      aria-hidden="true"
      class="flex size-6 shrink-0 items-center justify-center rounded-lg border-2"
      :class="checked ? 'border-done bg-done text-done-ink' : 'border-locked-deep'"
    >
      <PathIcon v-if="checked" name="check" class="size-4" />
    </span>
    <span v-if="subtitle" class="flex min-w-0 flex-1 flex-col">
      <span :class="checked ? 'text-muted line-through' : 'text-ink'">{{ text }}</span>
      <span class="text-xs font-semibold text-muted">{{ subtitle }}</span>
    </span>
    <span v-else :class="[checked ? 'text-muted line-through' : 'text-ink', badge ? 'min-w-0 flex-1' : '']">{{ text }}</span>
    <span
      v-if="badge"
      aria-hidden="true"
      class="shrink-0 rounded-full border-2 border-line px-2 py-0.5 text-xs font-extrabold text-muted"
    >
      {{ badge }}
    </span>
  </label>
</template>
