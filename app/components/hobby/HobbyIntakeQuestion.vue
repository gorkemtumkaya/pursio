<script setup lang="ts">
import { ref } from 'vue'
import type { Option } from '#shared/types/learner-profile'

/**
 * One tap question of the Panel (spec: path-intake, Req 5.2 to 5.6): a labelled group of toggle
 * buttons. Single or multi select is decided by the parent's toggle action.
 * Kept compact so two questions fit on one screen: options are 44 px high for touch and
 * 36 px with a mouse (`pointer-fine`).
 */
defineProps<{
  title: string
  hint?: string
  options: readonly Option[]
  selected: readonly string[]
}>()
defineEmits<{ toggle: [id: string] }>()

const titleId = useId()
const heading = ref<HTMLElement | null>(null)

defineExpose({
  focus: (): void => heading.value?.focus(),
})
</script>

<template>
  <div role="group" :aria-labelledby="titleId" class="flex flex-col gap-3">
    <p :id="titleId" ref="heading" tabindex="-1" class="flex flex-wrap items-baseline gap-x-2 outline-none">
      <span class="font-display text-lg leading-tight font-semibold text-ink">{{ title }}</span>
      <span v-if="hint" class="text-sm font-bold text-muted">{{ hint }}</span>
    </p>
    <ul class="flex flex-wrap gap-2">
      <li v-for="option in options" :key="option.id">
        <button
          type="button"
          :aria-pressed="selected.includes(option.id)"
          class="flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 py-1 text-left text-sm font-extrabold pointer-fine:min-h-9 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="
            selected.includes(option.id)
              ? 'border-primary bg-primary text-primary-ink'
              : 'border-line bg-surface text-ink hover:bg-bg'
          "
          @click="$emit('toggle', option.id)"
        >
          <PathIcon v-if="selected.includes(option.id)" name="check" class="size-4 shrink-0" />
          {{ option.label }}
        </button>
      </li>
    </ul>
  </div>
</template>
