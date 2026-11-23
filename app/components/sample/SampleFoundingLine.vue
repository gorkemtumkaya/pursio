<script setup lang="ts">
import { SAMPLE_COPY } from '~/utils/sample-copy'

/**
 * Desktop line under Make it yours (spec: sample-path, Req 9.10, decision 14): no price and no seat
 * count, and a plain link to the landing page's offer. It reads no state, so it sends no request.
 * `landing=1` keeps a visitor who has paths on the landing page instead of sending them to /path.
 */
</script>

<template>
  <p class="px-1 text-[13px] font-bold text-muted">
    {{ SAMPLE_COPY.foundingLine }}
    <NuxtLink
      to="/?landing=1#founding"
      class="inline-flex min-h-11 cursor-pointer items-center rounded-md font-extrabold text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {{ SAMPLE_COPY.foundingLink }}
    </NuxtLink>
  </p>
</template>
