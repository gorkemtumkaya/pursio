<script setup lang="ts">
// How it works: one card with an eyebrow, the heading and three numbered steps, so the
// section reads as a single flow like the other landing sections.
import { LANDING_COPY, LANDING_STEPS } from '~/utils/landing-copy'

const headingId = 'landing-how-heading'
</script>

<template>
  <section
    id="how"
    :aria-labelledby="headingId"
    class="mx-auto w-full max-w-[1160px] px-4 py-7 min-[700px]:px-8 min-[700px]:py-12"
  >
    <div class="flex flex-col gap-7 rounded-4xl border-2 border-line bg-surface p-[22px] min-[700px]:p-9">
    <div class="flex flex-col gap-1.5">
      <span class="text-[13px] font-extrabold tracking-[0.08em] text-accent-text">{{ LANDING_COPY.howEyebrow }}</span>
      <h2 :id="headingId" class="font-display text-[28px] leading-[1.1] font-semibold text-ink min-[700px]:text-[40px]">
        {{ LANDING_COPY.howItWorksHeading }}
      </h2>
    </div>
    <ol class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-x-9 gap-y-7">
      <li v-for="(step, index) in LANDING_STEPS" :key="step.title" class="flex flex-col gap-2.5">
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
    </div>
  </section>
</template>
