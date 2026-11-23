<script setup lang="ts">
import { computed } from 'vue'
import type { SamplePath } from '#shared/types/sample-path'
import MascotWick from '~/components/mascot/wick.vue'
import { SAMPLE_COPY } from '~/utils/sample-copy'
import { introLine } from '~/utils/sample-view'
import { toWickOutfit } from '~/utils/wick'

/**
 * Intro card of the sample page (spec: sample-path, Req 4.4 to 4.6): Wick in the file's outfit,
 * the counted line, the finish line as the page's only h1, and the help text.
 */
const props = defineProps<{ sample: SamplePath }>()

const { theme } = useTheme()
const outfit = computed(() => toWickOutfit(props.sample.mascot))
const line = computed(() => introLine(props.sample))
</script>

<template>
  <!--
    Phones: Wick and the counted line share a short top row; the heading and the help text take the
    full width under it, so the card stays short. Desktop: Wick on the left of all three, as in the
    desktop mockup. The CSS width overrides Wick's width attribute; its viewBox keeps the shape.
  -->
  <section
    aria-labelledby="sample-intro-title"
    class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 rounded-3xl border-2 border-line bg-surface px-4 py-4 shadow-raised-line lg:gap-x-6 lg:px-6 lg:py-5"
  >
    <MascotWick
      :theme="theme"
      :outfit="outfit"
      mood="happy"
      :size="80"
      aria-hidden="true"
      class="h-auto w-12 shrink-0 lg:row-span-3 lg:w-20"
    />
    <p class="text-[13px] font-extrabold tracking-[0.06em] text-accent-text lg:self-end">{{ line }}</p>
    <h1
      id="sample-intro-title"
      class="col-span-2 font-display text-[22px] leading-tight font-semibold text-ink lg:col-span-1 lg:col-start-2 lg:text-[32px]"
    >
      {{ sample.finish }}
    </h1>
    <p class="col-span-2 text-sm leading-normal text-muted lg:col-span-1 lg:col-start-2 lg:self-start lg:text-[15px]">
      {{ SAMPLE_COPY.introText }}
    </p>
  </section>
</template>
