<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  steps: readonly string[]
  active: number
}>()

const percent = computed(() =>
  props.steps.length === 0 ? 0 : ((props.active + 0.5) / props.steps.length) * 100,
)
</script>

<template>
  <div class="flex flex-col gap-5">
    <div
      class="h-3.5 overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-label="Building your path"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(percent)"
    >
      <div
        class="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-500"
        :style="{ width: `${percent}%` }"
      />
    </div>

    <ol class="flex flex-col gap-3.5">
      <li
        v-for="(step, index) in steps"
        :key="step"
        class="flex items-center gap-3.5 text-base font-bold"
        :class="index <= active ? 'text-ink' : 'text-muted'"
        :aria-current="index === active ? 'step' : undefined"
      >
        <span
          class="grid size-8 shrink-0 place-items-center rounded-full"
          :class="index < active ? 'bg-done text-done-ink' : index === active ? 'bg-primary' : 'bg-locked'"
        >
          <PathIcon v-if="index < active" name="check" class="size-4" />
          <span v-else-if="index === active" class="size-3 rounded-full bg-primary-ink" />
        </span>
        {{ step }}
      </li>
    </ol>

    <p class="text-sm font-bold text-muted">Usually takes about 15 seconds.</p>
  </div>
</template>
