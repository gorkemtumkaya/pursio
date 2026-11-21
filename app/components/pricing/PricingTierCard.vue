<script setup lang="ts">
import { NEW_PAGE } from '~/utils/landing'
import { PRICING_COPY, trialLabel } from '~/utils/pricing-copy'
import type { BillingFrequency, Tier } from '~/utils/pricing-tiers'

/**
 * One tier on /pricing. `price` is Paddle's formattedTotals.total for the
 * shown price ID, displayed exactly as Paddle returned it.
 */
const props = defineProps<{
  tier: Tier
  frequency: BillingFrequency
  price: string | undefined
  trialDays: number | undefined
  /** False shows a disabled "Coming soon" instead of Subscribe (NUXT_PUBLIC_PADDLE_CHECKOUT_ENABLED). */
  checkoutEnabled: boolean
}>()
const emit = defineEmits<{ subscribe: [priceId: string] }>()

const priceId = computed(() => props.tier.priceId?.[props.frequency] ?? null)
const headingId = computed(() => `pricing-tier-${props.tier.name.toLowerCase()}`)

const FOCUS = 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary'
const BUTTON = 'flex h-14 w-full items-center justify-center rounded-2xl font-head text-lg font-semibold'
</script>

<template>
  <article
    :aria-labelledby="headingId"
    class="flex min-w-0 flex-[1_1_300px] flex-col gap-4 rounded-4xl border-2 bg-surface p-[22px] min-[700px]:p-8"
    :class="tier.featured ? 'border-primary shadow-raised-primary' : 'border-line shadow-raised-line'"
  >
    <span
      v-if="tier.featured"
      class="self-start rounded-lg bg-gold px-3 py-1.5 text-[13px] font-extrabold tracking-[0.04em] text-gold-ink"
    >
      {{ PRICING_COPY.featuredBadge }}
    </span>
    <h2 :id="headingId" class="font-display text-[28px] leading-[1.1] font-semibold text-ink min-[700px]:text-[34px]">
      {{ tier.name }}
    </h2>
    <p class="text-base leading-normal text-muted">{{ tier.description }}</p>

    <p class="flex min-h-14 flex-wrap items-baseline gap-2" aria-live="polite">
      <template v-if="priceId === null">
        <span class="font-display text-[48px] leading-none font-semibold text-ink">{{ PRICING_COPY.freePrice }}</span>
      </template>
      <template v-else>
        <span class="font-display text-[48px] leading-none font-semibold text-ink">{{ price ?? PRICING_COPY.loading }}</span>
        <span class="text-base font-extrabold text-ink">
          {{ frequency === 'month' ? PRICING_COPY.perMonth : PRICING_COPY.perYear }}
        </span>
      </template>
    </p>
    <p v-if="trialDays !== undefined" class="text-[15px] font-extrabold text-accent-text">{{ trialLabel(trialDays) }}</p>

    <ul class="flex flex-1 flex-col gap-2.5">
      <li v-for="feature in tier.features" :key="feature" class="flex items-start gap-3 text-base leading-[1.4] font-bold text-ink">
        <span aria-hidden="true" class="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-done text-done-ink">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span>{{ feature }}</span>
      </li>
    </ul>

    <NuxtLink v-if="priceId === null" :to="NEW_PAGE" :class="[BUTTON, FOCUS, 'border-2 border-line bg-surface text-ink']">
      {{ PRICING_COPY.freeCta }}
    </NuxtLink>
    <button
      v-else-if="!checkoutEnabled"
      type="button"
      disabled
      :class="[BUTTON, 'cursor-not-allowed border-2 border-line bg-surface text-muted']"
    >
      {{ PRICING_COPY.comingSoonCta }}
    </button>
    <button
      v-else
      type="button"
      :disabled="price === undefined"
      :class="[BUTTON, FOCUS, 'cursor-pointer bg-primary text-primary-ink shadow-raised-primary disabled:cursor-wait disabled:opacity-60']"
      @click="emit('subscribe', priceId)"
    >
      {{ PRICING_COPY.subscribeCta }}
    </button>
  </article>
</template>
