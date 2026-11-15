<script setup lang="ts">
import { useId } from 'vue'

/**
 * A titled card grid of the Fresh_Page (spec: fresh, Req 13.1, 13.3, 13.5): 1 column of list
 * cards below `md`, 2 columns from `md` and 3 from `lg`. Each card goes in the default slot as
 * an `<li>`. Without a heading the list is labelled by `label`.
 */
const props = defineProps<{ heading: string | null; label?: string }>()

const headingId = `fresh-section-${useId()}`
</script>

<template>
  <section :aria-labelledby="props.heading ? headingId : undefined" :aria-label="props.heading ? undefined : props.label" class="flex flex-col gap-3">
    <h2 v-if="heading" :id="headingId" class="font-head text-[13px] font-extrabold tracking-wider text-muted uppercase">
      {{ heading }}
    </h2>
    <ul class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      <slot />
    </ul>
  </section>
</template>
