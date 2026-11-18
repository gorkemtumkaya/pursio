<script setup lang="ts">
// How it works: an eyebrow, the heading and three numbered cards (design: dev_docs "Landing page").
import { LANDING_COPY, LANDING_STEPS } from '~/utils/landing-copy'

const headingId = 'landing-how-heading'
</script>

<template>
  <section
    id="how"
    :aria-labelledby="headingId"
    class="mx-auto flex w-full max-w-[1160px] flex-col gap-6 px-4 py-7 min-[700px]:px-8 min-[700px]:py-12"
  >
    <div class="flex flex-col gap-1.5">
      <span class="text-[13px] font-extrabold tracking-[0.08em] text-accent-text">{{ LANDING_COPY.howEyebrow }}</span>
      <h2 :id="headingId" class="font-display text-[28px] leading-[1.1] font-semibold text-ink min-[700px]:text-[40px]">
        {{ LANDING_COPY.howItWorksHeading }}
      </h2>
    </div>
    <ol class="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-[18px]">
      <li
        v-for="(step, index) in LANDING_STEPS"
        :key="step.title"
        class="flex flex-col gap-2.5 rounded-3xl border-2 border-line bg-surface p-[22px]"
      >
        <span
          aria-hidden="true"
          class="flex size-10 items-center justify-center rounded-xl bg-ink font-head text-xl font-semibold text-bg"
        >
          {{ index + 1 }}
        </span>
        <h3 class="font-head text-[21px] font-semibold text-ink">{{ step.title }}</h3>
        <p class="text-[15px] leading-normal text-muted">{{ step.line }}</p>
      </li>
    </ol>
  </section>
</template>
