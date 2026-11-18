<script setup lang="ts">
// Hero of the Landing_Page (design: dev_docs "Landing page"; spec: landing-page, Req 3, 6, 15.5).
import { track } from '~/utils/analytics'
import { HOBBY_MAX_LENGTH, landingHandoffUrl, normalizeHobby } from '~/utils/landing'
import { EXAMPLE_HOBBIES, LANDING_COPY, type ExampleHobby } from '~/utils/landing-copy'

const inputId = 'landing-hobby'
const messageId = 'landing-hobby-message'

const hobby = ref('')
const message = ref('')
const input = ref<HTMLInputElement | null>(null)

/**
 * Empty text: show the message, focus the input, stay on `/` (Req 3.6).
 * Otherwise track the length only, never the text (Req 3.5, 3.11), then hand off.
 * track() never throws, so navigation always runs (Req 15.5).
 */
function onSubmit(): void {
  const text = normalizeHobby(hobby.value)
  if (text === null) {
    message.value = LANDING_COPY.emptyHobby
    input.value?.focus()
    return
  }
  message.value = ''
  track('hero_hobby_submitted', { length: text.length })
  void navigateTo(landingHandoffUrl(text))
}

function onInput(): void {
  if (message.value !== '' && hobby.value.trim() !== '') message.value = ''
}

/** A chip fills the input, as in the design; "Build my path" starts the path. */
function pick(label: ExampleHobby): void {
  hobby.value = label
  message.value = ''
  track('example_hobby_clicked', { hobby: label })
  input.value?.focus()
}

const FOCUS = 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary'
</script>

<template>
  <section
    id="top"
    class="mx-auto flex w-full max-w-[1160px] flex-wrap items-center gap-7 px-4 pt-3 pb-7 min-[700px]:gap-12 min-[700px]:px-8 min-[700px]:pt-9 min-[700px]:pb-12"
  >
    <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-[18px]">
      <span
        class="self-start rounded-[10px] bg-primary-soft px-3 py-1.5 text-[13px] font-extrabold tracking-[0.04em] text-accent-text"
      >
        {{ LANDING_COPY.heroBadge }}
      </span>
      <h1
        class="font-display text-4xl leading-[1.05] font-semibold tracking-[-0.01em] text-ink min-[700px]:text-[58px]"
      >
        {{ LANDING_COPY.headline }}
      </h1>
      <p class="max-w-[520px] text-base leading-normal text-muted min-[700px]:text-[19px]">
        {{ LANDING_COPY.subline }}
      </p>

      <form
        class="flex max-w-[540px] min-w-0 flex-col gap-3 rounded-3xl border-2 border-line bg-surface p-3.5 shadow-raised-line"
        novalidate
        @submit.prevent="onSubmit"
      >
        <label :for="inputId" class="text-[13px] font-extrabold tracking-[0.06em] text-muted">
          {{ LANDING_COPY.hobbyLabel }}
        </label>
        <div class="flex flex-wrap gap-2.5">
          <input
            :id="inputId"
            ref="input"
            v-model="hobby"
            type="text"
            name="hobby"
            autocomplete="off"
            :maxlength="HOBBY_MAX_LENGTH"
            :placeholder="LANDING_COPY.hobbyPlaceholder"
            :aria-describedby="message ? messageId : undefined"
            :aria-invalid="message ? 'true' : undefined"
            class="h-14 min-w-0 flex-[1_1_200px] rounded-2xl border-2 bg-bg px-4 text-[17px] font-bold text-ink placeholder:text-muted"
            :class="[hobby ? 'border-primary' : 'border-line', FOCUS]"
            @input="onInput"
          >
          <button
            type="submit"
            class="flex h-14 flex-[1_1_160px] items-center justify-center rounded-2xl bg-primary font-head text-lg font-semibold whitespace-nowrap text-primary-ink shadow-[0_5px_0_var(--pursio-primary-deep)]"
            :class="FOCUS"
          >
            {{ LANDING_COPY.buildMyPath }}
          </button>
        </div>
        <p :id="messageId" role="alert" class="text-sm font-bold text-danger-text empty:hidden">{{ message }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-[13px] font-extrabold text-muted">{{ LANDING_COPY.chipsLabel }}</span>
          <button
            v-for="label in EXAMPLE_HOBBIES"
            :key="label"
            type="button"
            class="min-h-11 cursor-pointer rounded-[22px] border-2 border-line bg-surface px-3.5 text-sm font-extrabold text-ink"
            :class="FOCUS"
            @click="pick(label)"
          >
            {{ label }}
          </button>
        </div>
      </form>
      <span class="text-sm font-bold text-muted">{{ LANDING_COPY.heroNote }}</span>
    </div>

    <div class="flex min-w-0 flex-[1_1_340px] justify-center">
      <LandingPathPreview />
    </div>
  </section>
</template>
