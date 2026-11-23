<script setup lang="ts">
// Closing call to action of the Landing_Page: one card that sends the visitor back to the
// hobby input of the hero, where the usual flow continues. The link targets `#top`, so it
// works without script; with script it also puts the cursor in the input.
import { LANDING_COPY } from '~/utils/landing-copy'

const headingId = 'landing-closing-heading'
/** Id of the hobby input in LandingHero. */
const HOBBY_INPUT_ID = 'landing-hobby'

function onClick(event: MouseEvent): void {
  const input = document.getElementById(HOBBY_INPUT_ID)
  if (!(input instanceof HTMLInputElement)) return
  event.preventDefault()
  // Focus without the browser's jump, then scroll: smooth when `scroll-smooth` is on <html>.
  input.focus({ preventScroll: true })
  input.scrollIntoView({ block: 'center' })
}
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="mx-auto w-full max-w-[1160px] px-4 py-7 min-[700px]:px-8 min-[700px]:py-12"
  >
    <div class="flex flex-col items-center gap-4 rounded-4xl bg-surface-2 p-[22px] text-center min-[700px]:p-12">
      <h2 :id="headingId" class="font-display text-[28px] leading-[1.1] font-semibold text-ink min-[700px]:text-[40px]">
        {{ LANDING_COPY.closingHeading }}
      </h2>
      <p class="max-w-[460px] text-base leading-normal text-muted">{{ LANDING_COPY.closingText }}</p>
      <AppButton href="#top" bouncy class="mt-1" @click="onClick">
        {{ LANDING_COPY.closingCta }}
      </AppButton>
    </div>
  </section>
</template>
