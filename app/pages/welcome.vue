<script setup lang="ts">
import { NEW_PAGE } from '~/utils/landing'
import { LANDING_COPY } from '~/utils/landing-copy'
import { PRICING_COPY } from '~/utils/pricing-copy'

/** Paddle Checkout redirects here after a successful purchase (settings.successUrl). */
useHead({ title: `${PRICING_COPY.welcomeTitle} · ${LANDING_COPY.brandName}` })
</script>

<template>
  <div class="flex min-h-dvh flex-col overflow-x-clip bg-bg">
    <LandingHeader />
    <main class="mx-auto flex w-full max-w-[820px] flex-1 flex-col items-start gap-5 px-4 py-7 min-[700px]:px-8 min-[700px]:py-12">
      <h1 class="font-display text-4xl leading-[1.05] font-semibold text-ink min-[700px]:text-[58px]">
        {{ PRICING_COPY.welcomeTitle }}
      </h1>
      <p class="text-base leading-[1.55] text-ink min-[700px]:text-[19px]">{{ PRICING_COPY.welcomeText }}</p>
      <NuxtLink
        :to="NEW_PAGE"
        class="flex h-14 items-center justify-center rounded-2xl bg-primary px-6 font-head text-lg font-semibold text-primary-ink shadow-raised-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {{ PRICING_COPY.welcomeCta }}
      </NuxtLink>
    </main>
    <LandingFooter />
  </div>
</template>
