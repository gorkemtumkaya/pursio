<script setup lang="ts">
// Composes the landing sections in the order of the design (dev_docs "Landing page").
// No analytics here: this view also renders in the `pending` shell, so
// `pages/index.vue` sends `landing_viewed` when the view becomes `landing`.

// The header links scroll to their sections smoothly while the landing is shown,
// unless the visitor asked for reduced motion.
useHead({ htmlAttrs: { class: 'motion-safe:scroll-smooth' } })
</script>

<template>
  <div class="flex min-h-dvh w-full flex-col overflow-x-clip">
    <LandingHeader />
    <main class="flex w-full min-w-0 flex-1 flex-col">
      <LandingHero />
      <LandingHowItWorks />
      <LandingWick />
      <LandingFounding />
      <LandingFaq />
    </main>
    <LandingFooter />
  </div>
</template>
