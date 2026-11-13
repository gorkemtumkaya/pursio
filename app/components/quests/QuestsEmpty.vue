<script setup lang="ts">
import MascotWick from '~/components/mascot/wick.vue'
import { NEW_HOBBY_PATH } from '~/utils/hobby-store'

/** Shown when there is no hobby to practice, or all are archived (Req 5.8). */
const { theme } = useTheme()
</script>

<template>
  <section class="flex flex-col items-center gap-4 rounded-3xl border-2 border-line bg-surface px-6 py-10 text-center">
    <MascotWick :theme="theme" mood="sleep" :size="120" />
    <h1 class="font-display text-2xl font-semibold text-ink">No hobby to practice yet</h1>
    <p class="max-w-sm text-[15px] leading-normal text-muted">Pick a hobby and Wick builds a path, with daily quests to go with it.</p>
    <NuxtLink
      :to="NEW_HOBBY_PATH"
      class="flex h-12 items-center justify-center rounded-2xl bg-primary px-6 font-head text-base font-semibold text-primary-ink shadow-raised-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      Build a path
    </NuxtLink>
  </section>
</template>
