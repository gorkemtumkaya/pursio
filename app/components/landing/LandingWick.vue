<script setup lang="ts">
import MascotWick from '~/components/mascot/wick.vue'
import { LANDING_COPY, WICK_SHOWCASE } from '~/utils/landing-copy'

/** Meet Wick: a dark banner card with Wick in three hobby outfits (design: dev_docs "Landing page"). */
const headingId = 'landing-wick-heading'
const { theme } = useTheme()
/** Wick takes its size in px, so each width gets its own copy and CSS shows one. */
const SIZES = [
  { px: 124, show: 'max-[699px]:hidden' },
  { px: 100, show: 'min-[700px]:hidden' },
] as const
</script>

<template>
  <section
    id="wick"
    :aria-labelledby="headingId"
    class="mx-auto w-full max-w-[1160px] px-4 py-7 min-[700px]:px-8 min-[700px]:py-12"
  >
    <div
      class="flex flex-wrap items-center gap-7 rounded-4xl bg-banner p-[22px] text-banner-ink shadow-[0_8px_0_var(--pursio-banner-deep)] min-[700px]:p-9"
    >
      <div class="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
        <span class="text-[13px] font-extrabold tracking-[0.08em] text-banner-muted">{{ LANDING_COPY.wickEyebrow }}</span>
        <h2 :id="headingId" class="font-display text-[28px] leading-[1.1] font-semibold min-[700px]:text-[40px]">
          {{ LANDING_COPY.wickHeading }}
        </h2>
        <p class="max-w-[460px] text-base leading-[1.55] text-banner-muted">{{ LANDING_COPY.wickText }}</p>
      </div>
      <div class="flex min-w-0 flex-[1_1_340px] flex-wrap justify-center gap-2">
        <div v-for="wick in WICK_SHOWCASE" :key="wick.outfit" class="flex flex-col items-center gap-0.5">
          <span v-for="size in SIZES" :key="size.px" :class="size.show">
            <MascotWick
              :theme="theme"
              :mood="wick.mood"
              :outfit="wick.outfit"
              :size="size.px"
              :label="`Wick dressed for ${wick.label.toLowerCase()}`"
            />
          </span>
          <span class="text-[13px] font-extrabold text-banner-muted">{{ wick.label }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
