<script setup lang="ts">
import { ref } from 'vue'

/** One "Here's what I got" Chip: tag, value and a × button (spec: path-intake, Req 4.3, 4.4). */
defineProps<{
  tag: string
  value: string
  removeLabel: string
  /** The "Not for you" tag uses the warning text color, as in the mockup. */
  warn?: boolean
}>()
defineEmits<{ remove: [] }>()

const removeButton = ref<HTMLButtonElement | null>(null)

defineExpose({
  focus: (): void => removeButton.value?.focus(),
})
</script>

<template>
  <li class="flex min-h-11 items-center gap-2 rounded-full border-2 border-line bg-surface py-1 pr-1 pl-4">
    <span class="text-[13px] font-extrabold uppercase tracking-[0.06em]" :class="warn ? 'text-danger-text' : 'text-muted'">
      {{ tag }}
    </span>
    <span class="min-w-0 text-[15px] font-extrabold text-ink">{{ value }}</span>
    <button
      ref="removeButton"
      type="button"
      :aria-label="removeLabel"
      class="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
      @click="$emit('remove')"
    >
      <PathIcon name="close" class="size-4" />
    </button>
  </li>
</template>
