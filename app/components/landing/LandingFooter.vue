<script setup lang="ts">
import { LANDING_COPY } from '~/utils/landing-copy'
import { CONTACT_EMAIL } from '~/utils/legal-copy'

/** Footer of the Landing_Page and the Legal_Pages (design: dev_docs "Landing page"; spec: landing-page, Req 9). */
const REPO_URL = 'https://github.com/gorkemtumkaya/pursio'
const CONTACT_URL = `mailto:${CONTACT_EMAIL}`
const LEGAL_LINKS: readonly { to: string; label: string }[] = [
  { to: '/privacy', label: LANDING_COPY.privacy },
  { to: '/terms', label: LANDING_COPY.terms },
  { to: '/refund', label: LANDING_COPY.refund },
]
const LINK_CLASS =
  'flex min-h-11 items-center rounded-lg text-muted underline hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary'
</script>

<template>
  <footer
    class="mx-auto flex w-full max-w-[1160px] flex-wrap items-center justify-between gap-x-3.5 gap-y-1 border-t-2 border-line px-4 pt-5 pb-8 text-sm font-bold text-muted min-[700px]:px-8"
  >
    <span>{{ LANDING_COPY.copyright }}</span>
    <nav :aria-label="LANDING_COPY.footerNavLabel" class="flex flex-wrap gap-x-[22px]">
      <!-- <a :href="REPO_URL" rel="noopener" :class="LINK_CLASS">{{ LANDING_COPY.sourceCode }}</a> -->
      <NuxtLink v-for="link in LEGAL_LINKS" :key="link.to" :to="link.to" :class="LINK_CLASS">
        {{ link.label }}
      </NuxtLink>
      <a :href="CONTACT_URL" :class="LINK_CLASS">{{ LANDING_COPY.contact }}</a>
    </nav>
  </footer>
</template>
