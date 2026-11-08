<script setup lang="ts">
/** Hobby name and progress bar inside a hobby list entry. `percent` is 0 to 100. */
defineProps<{ hobby: string; percent: number }>()
</script>

<template>
  <span class="text-[15px] font-extrabold">
    {{ hobby }}<span class="sr-only">, {{ percent }}% complete</span>
  </span>
  <span aria-hidden="true" class="block h-2 w-full overflow-hidden rounded-full bg-locked">
    <span class="block h-full bg-done" :style="{ width: `${percent}%` }" />
  </span>
</template>
