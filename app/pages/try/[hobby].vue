<script setup lang="ts">
import { computed } from 'vue'
import { SAMPLE_COPY } from '~/utils/sample-copy'
import { getSample } from '~/utils/sample-paths'

/**
 * Sample path page (spec: sample-path). Public and read only: no session starts here (the global
 * middleware skips `/try/`), and nothing reads an account. A slug that is not a sample page never
 * reaches this component: the `sample-slug` middleware sends it to `/new`. The three pages are
 * prerendered (`routeRules` in nuxt.config.ts) and carry robots noindex (Req 1.6, 1.7).
 */
definePageMeta({ middleware: ['sample-slug'] })

const route = useRoute()
const sample = computed(() => getSample(String(route.params.hobby ?? '')))

useSeoMeta({
  title: () => (sample.value ? SAMPLE_COPY.pageTitle(sample.value.hobby) : 'Pursio'),
  robots: 'noindex',
})
</script>

<template>
  <SampleView v-if="sample" :sample="sample" />
</template>
