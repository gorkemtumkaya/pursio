<script setup lang="ts">
import { NEW_PAGE } from '~/utils/landing'
import { LANDING_COPY } from '~/utils/landing-copy'

/**
 * Header of the Landing_Page and the Legal_Pages (design: dev_docs "Landing page").
 * Brand on the left, section links in the middle from 900 px, "Open the app" on the right.
 * The links keep the current query on `/`, so `/?landing=1` stays on the landing.
 */
const route = useRoute()
const NAV: readonly { hash: string; label: string }[] = [
  { hash: '#how', label: LANDING_COPY.navHow },
  { hash: '#wick', label: LANDING_COPY.navWick },
  { hash: '#founding', label: LANDING_COPY.navFounding },
  { hash: '#faq', label: LANDING_COPY.navFaq },
]

function sectionLink(hash: string) {
  return { path: '/', hash, query: route.path === '/' ? route.query : undefined }
}

const FOCUS = 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary'
</script>

<template>
  <header
    class="mx-auto flex w-full max-w-[1160px] items-center justify-between gap-4 px-4 py-[18px] min-[700px]:px-8"
  >
    <NuxtLink
      :to="{ path: '/', query: route.path === '/' ? route.query : undefined }"
      class="flex min-h-11 items-center gap-2.5 rounded-2xl text-ink"
      :class="FOCUS"
    >
      <span aria-hidden="true" class="size-9.5 shrink-0 bg-(image:--pursio-logo) bg-contain bg-center bg-no-repeat" />
      <span class="font-head text-[26px] leading-none font-bold">{{ LANDING_COPY.brandName }}</span>
    </NuxtLink>

    <nav
      :aria-label="LANDING_COPY.headerNavLabel"
      class="flex items-center gap-7 text-[15px] font-extrabold max-[899px]:hidden"
    >
      <NuxtLink
        v-for="item in NAV"
        :key="item.hash"
        :to="sectionLink(item.hash)"
        class="flex min-h-11 items-center rounded-lg text-muted hover:text-ink"
        :class="FOCUS"
      >
        {{ item.label }}
      </NuxtLink>
    </nav>

    <NuxtLink
      :to="NEW_PAGE"
      class="flex h-11 items-center rounded-[14px] border-2 border-line bg-surface px-4 text-[15px] font-extrabold whitespace-nowrap text-ink"
      :class="FOCUS"
    >
      {{ LANDING_COPY.openApp }}
    </NuxtLink>
  </header>
</template>
