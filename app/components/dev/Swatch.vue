<script setup lang="ts">
defineProps<{
  name: string
  /** Full static Tailwind class, e.g. "bg-primary", so the scanner finds it. */
  swatchClass: string
  value: string
}>()
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl border-2 border-line bg-surface p-2">
    <div class="size-10 shrink-0 rounded-lg border-2 border-line" :class="swatchClass" />
    <div class="min-w-0">
      <p class="font-head text-sm font-semibold text-ink">{{ name }}</p>
      <p class="truncate font-mono text-xs text-muted">{{ value || '…' }}</p>
    </div>
  </div>
</template>
