<script setup lang="ts">
import { ref } from 'vue'
import type { Option } from '#shared/types/learner-profile'

/**
 * One tap question of the Panel (spec: path-intake, Req 5.2 to 5.6): a labelled group of toggle
 * buttons. Single or multi select is decided by the parent's toggle action.
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
      <span class="font-display text-[21px] leading-tight font-semibold text-ink">{{ title }}</span>
      <span v-if="hint" class="text-[15px] font-bold text-muted">{{ hint }}</span>
    </p>
    <ul class="flex flex-wrap gap-2">
      <li v-for="option in options" :key="option.id">
        <button
          type="button"
          :aria-pressed="selected.includes(option.id)"
          class="flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 py-1.5 text-left text-[15px] font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
