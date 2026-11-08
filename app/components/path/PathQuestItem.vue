<script setup lang="ts">
/** One quest checkbox in the Node_Detail (Req 8.6–8.8, 13.8). */
defineProps<{ text: string; checked: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <label
    class="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-surface px-3 py-2 text-[15px] font-bold has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ink"
  >
    <input type="checkbox" class="sr-only" :checked="checked" @change="emit('toggle')" />
    <span
      aria-hidden="true"
      class="flex size-6 shrink-0 items-center justify-center rounded-lg border-2"
      :class="checked ? 'border-done bg-done text-done-ink' : 'border-locked-deep'"
    >
      <PathIcon v-if="checked" name="check" class="size-4" />
    </span>
    <span :class="checked ? 'text-muted line-through' : 'text-ink'">{{ text }}</span>
  </label>
</template>
