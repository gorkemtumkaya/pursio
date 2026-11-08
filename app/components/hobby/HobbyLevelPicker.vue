<script setup lang="ts">
defineProps<{ modelValue: StartLevel }>()
defineEmits<{ 'update:modelValue': [StartLevel] }>()

const labelId = useId()
</script>

<template>
  <div class="flex flex-col gap-3.5">
    <span :id="labelId" class="text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted">
      Where are you now?
    </span>
    <div
      role="group"
      :aria-labelledby="labelId"
      class="grid grid-cols-3 gap-1.5 rounded-[14px] bg-surface-2 p-1"
    >
      <button
        v-for="level in START_LEVELS"
        :key="level"
        type="button"
        :aria-pressed="modelValue === level"
        class="min-h-[46px] rounded-[10px] px-2 py-1 text-sm leading-[1.15] font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :class="modelValue === level ? 'bg-surface text-ink shadow-[0_3px_0_var(--color-line)]' : 'text-muted'"
        @click="$emit('update:modelValue', level)"
      >
        {{ LEVEL_LABELS[level] }}
      </button>
    </div>
  </div>
</template>
