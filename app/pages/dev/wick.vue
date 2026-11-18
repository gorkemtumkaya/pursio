<script setup lang="ts">
// Dev-only sheet of every Wick mood, outfit and theme. Returns 404 in production builds.
import MascotWick from '~/components/mascot/wick.vue'
import type { WickMood, WickOutfit, WickTheme } from '~/utils/wick'

definePageMeta({
  middleware: () => {
    if (!import.meta.dev) {
      return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page not found' }))
    }
  },
})

useHead({ title: 'Wick · Pursio' })

const MOODS: readonly WickMood[] = ['idle', 'happy', 'cheer', 'proud', 'encourage', 'focus', 'surprised', 'think', 'sleep']
const OUTFITS: readonly WickOutfit[] = [
  'bouldering',
  'cooking',
  'explorer',
  'gardening',
  'guitar',
  'photography',
  'reading',
  'founding',
]
const THEMES: readonly WickTheme[] = ['boulder', 'trail', 'halloween']
</script>

<template>
  <main class="mx-auto flex w-full max-w-[1400px] flex-col gap-8 p-6">
    <section v-for="theme in THEMES" :key="theme" class="flex flex-col gap-3">
      <h2 class="font-head text-xl font-semibold text-ink">{{ theme }}</h2>
      <div class="flex flex-wrap gap-4">
        <figure v-for="mood in MOODS" :key="mood" class="flex flex-col items-center text-xs font-bold text-muted">
          <MascotWick :theme="theme" :mood="mood" :size="120" :animated="false" />
          <figcaption>{{ mood }}</figcaption>
        </figure>
      </div>
      <div class="flex flex-wrap gap-4">
        <figure v-for="outfit in OUTFITS" :key="outfit" class="flex flex-col items-center text-xs font-bold text-muted">
          <MascotWick :theme="theme" mood="happy" :outfit="outfit" :size="120" :animated="false" />
          <figcaption>{{ outfit }}</figcaption>
        </figure>
      </div>
    </section>
  </main>
</template>
