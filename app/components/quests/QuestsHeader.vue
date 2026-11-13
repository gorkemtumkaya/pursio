<script setup lang="ts">
/**
 * Top of the Quests page: the hobby name as a small heading on desktop only,
 * the title "Quests", and a subtitle on mobile only (Req 1.7, 15.3).
 */
defineProps<{ hobbyName: string; subtitle: string }>()
</script>

<template>
  <header class="flex min-w-0 flex-col gap-1">
    <p class="hidden truncate text-sm font-extrabold tracking-[0.04em] text-muted uppercase lg:block">{{ hobbyName }}</p>
    <h1 class="font-display text-3xl font-semibold text-ink lg:text-4xl">Quests</h1>
    <p class="text-[15px] leading-normal text-muted lg:hidden">{{ subtitle }}</p>
  </header>
</template>
