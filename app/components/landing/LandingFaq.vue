<script setup lang="ts">
// FAQ of the Landing_Page (design: dev_docs "Landing page"; spec: landing-page, Req 8, 13.2, 13.5).
// Native details/summary, so it works without script. The shared `name` lets
// only one item stay open, and the first one starts open, as in the design.
import { FAQ_ITEMS, LANDING_COPY } from '~/utils/landing-copy'

const headingId = 'landing-faq-heading'
</script>

<template>
  <section
    id="faq"
    :aria-labelledby="headingId"
    class="mx-auto flex w-full max-w-[820px] flex-col gap-3.5 px-4 py-7 min-[700px]:px-8 min-[700px]:py-12"
  >
    <h2 :id="headingId" class="mb-1.5 font-display text-[28px] leading-[1.1] font-semibold text-ink min-[700px]:text-[40px]">
      {{ LANDING_COPY.faqHeading }}
    </h2>
    <details
      v-for="(item, index) in FAQ_ITEMS"
      :key="item.question"
      name="landing-faq"
      :open="index === 0"
      class="group min-w-0 overflow-hidden rounded-[20px] border-2 border-line bg-surface"
    >
      <summary
        class="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-3 rounded-[18px] px-[18px] py-3.5 text-[17px] font-extrabold text-ink focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
      >
        <span class="min-w-0">{{ item.question }}</span>
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="shrink-0 group-open:rotate-180"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <p class="px-[18px] pb-[18px] text-[15px] leading-[1.55] text-muted">{{ item.answer }}</p>
    </details>
  </section>
</template>
