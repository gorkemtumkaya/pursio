<script setup lang="ts">
withDefaults(
  defineProps<{
    ideas: readonly string[]
    surprise?: boolean
    disabled?: boolean
    /** Show the "Or try:" lead-in before the chips. */
    showLabel?: boolean
  }>(),
  { surprise: false, disabled: false, showLabel: true },
)

const emit = defineEmits<{
  pick: [idea: string]
  surprise: []
}>()

const chipClass =
  'h-10 rounded-full border-2 px-3.5 text-sm font-extrabold '
  + 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary '
  + 'disabled:cursor-not-allowed disabled:opacity-50'
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <span v-if="showLabel" class="text-sm font-extrabold text-muted">Or try:</span>
    <button
      v-for="idea in ideas"
      :key="idea"
      type="button"
      :disabled="disabled"
      :class="[chipClass, 'border-line bg-surface text-ink']"
      @click="emit('pick', idea)"
    >
      {{ idea }}
    </button>
    <button
      v-if="surprise"
      type="button"
      :disabled="disabled"
      :class="[chipClass, 'border-dashed border-primary bg-primary-soft text-accent-text']"
      @click="emit('surprise')"
    >
      Surprise me
    </button>
  </div>
</template>
