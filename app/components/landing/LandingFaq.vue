<script setup lang="ts">
// FAQ of the Landing_Page (design: dev_docs "Landing page"; spec: landing-page, Req 8, 13.2, 13.5).
// One card holds the heading and every question, with a line between questions.
// Native details/summary, so it works without script. The shared `name` lets
// only one item stay open, and the first one starts open, as in the design.
import { FAQ_ITEMS, LANDING_COPY } from '~/utils/landing-copy'

const headingId = 'landing-faq-heading'
</script>

<template>
  <section
    id="faq"
    :aria-labelledby="headingId"
    class="mx-auto w-full max-w-[1160px] px-4 py-7 min-[700px]:px-8 min-[700px]:py-12"
  >
    <div class="flex flex-col rounded-4xl border-2 border-line bg-surface p-[22px] min-[700px]:p-9">
    <h2 :id="headingId" class="mb-3 font-display text-[28px] leading-[1.1] font-semibold text-ink min-[700px]:text-[40px]">
      {{ LANDING_COPY.faqHeading }}
    </h2>
    <details
      v-for="(item, index) in FAQ_ITEMS"
      :key="item.question"
      name="landing-faq"
      :open="index === 0"
      class="landing-faq-item group min-w-0 border-t-2 border-line"
    >
      <summary
        class="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-3 rounded-xl py-3.5 text-[17px] font-extrabold text-ink transition-colors duration-150 hover:text-accent-text focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
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
          class="shrink-0 transition-transform duration-200 ease-out group-open:rotate-180 motion-reduce:transition-none"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <p class="max-w-[720px] pb-[18px] text-[15px] leading-[1.55] text-muted">{{ item.answer }}</p>
    </details>
    </div>
  </section>
</template>

<!--
  Smooth open and close, in CSS only so the FAQ still works without script. The answer of a
  <details> lives in ::details-content; its height animates between 0 and auto, which needs
  `interpolate-size`. A browser without these opens and closes at once, as before.
  Not scoped: the class is unique, and the pseudo-element stays as written.
-->
<style>
.landing-faq-item {
  interpolate-size: allow-keywords;
}
.landing-faq-item::details-content {
  block-size: 0;
  overflow-y: clip;
  transition:
    block-size 250ms ease-out,
    content-visibility 250ms allow-discrete;
}
.landing-faq-item[open]::details-content {
  block-size: auto;
}
@media (prefers-reduced-motion: reduce) {
  .landing-faq-item::details-content {
    transition: none;
  }
}
</style>
