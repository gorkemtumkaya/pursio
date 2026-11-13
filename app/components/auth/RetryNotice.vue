<script setup lang="ts">
/** A Friendly_Message with one button that repeats the failed step. */
withDefaults(defineProps<{ message: string; label?: string }>(), { label: 'Try again' })
const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="flex flex-col items-center gap-4 px-4 py-14">
    <p
      role="alert"
      class="max-w-md rounded-2xl border-2 border-line bg-surface px-5 py-4 text-center text-[15px] font-bold text-ink"
    >
      {{ message }}
    </p>
    <button
      type="button"
      class="h-12 rounded-2xl bg-primary px-6 font-head text-base font-semibold text-primary-ink shadow-raised-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      @click="emit('retry')"
    >
      {{ label }}
    </button>
  </div>
</template>
