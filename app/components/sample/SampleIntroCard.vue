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
  <section
    aria-labelledby="sample-intro-title"
    class="flex items-center gap-4 rounded-3xl border-2 border-line bg-surface px-4 py-5 shadow-raised-line lg:gap-6 lg:px-6"
  >
    <MascotWick
      :theme="theme"
      :outfit="outfit"
      mood="happy"
      :size="80"
      aria-hidden="true"
      class="shrink-0"
    />
    <div class="flex min-w-0 flex-col gap-1.5">
      <p class="text-[13px] font-extrabold tracking-[0.06em] text-accent-text">{{ line }}</p>
      <h1 id="sample-intro-title" class="font-display text-[22px] leading-tight font-semibold text-ink lg:text-[32px]">
        {{ sample.finish }}
      </h1>
      <p class="text-[15px] leading-normal text-muted">{{ SAMPLE_COPY.introText }}</p>
    </div>
  </section>
</template>
