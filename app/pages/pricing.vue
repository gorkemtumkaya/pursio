<script setup lang="ts">
import { LANDING_COPY } from '~/utils/landing-copy'
import { COUNTRY_HEADER, countryFromHeader } from '~/utils/paddle-pricing'
import { PRICING_COPY } from '~/utils/pricing-copy'

/**
 * Pricing page with Paddle Checkout. The country is read from the CDN header
 * during server rendering and handed to the client through useState. On a
 * client-side navigation there is no header, so the country stays unknown and
 * Paddle locates the visitor by IP.
 */
const country = useState('pricing-country', () => countryFromHeader(useRequestHeaders([COUNTRY_HEADER])[COUNTRY_HEADER]))

useHead({ title: `${PRICING_COPY.title} · ${LANDING_COPY.brandName}` })
</script>

<template>
  <div class="flex min-h-dvh flex-col overflow-x-clip bg-bg">
    <LandingHeader />
    <main class="mx-auto w-full max-w-[1160px] flex-1 px-4 py-7 min-[700px]:px-8 min-[700px]:py-12">
      <div class="mb-8 flex flex-col items-center gap-3 text-center">
        <h1 class="font-display text-4xl leading-[1.05] font-semibold text-ink min-[700px]:text-[58px]">
          {{ PRICING_COPY.heading }}
        </h1>
        <p class="text-base leading-normal text-muted min-[700px]:text-[19px]">{{ PRICING_COPY.intro }}</p>
      </div>
      <PricingView :country="country" />
    </main>
    <LandingFooter />
  </div>
</template>
