<script setup lang="ts">
import { EMAIL_MAX_LENGTH, parseWaitlistEmail, type WaitlistKind } from '#shared/utils/waitlist'
import { track } from '~/utils/analytics'
import { LANDING_COPY } from '~/utils/landing-copy'

/**
 * Email form of the founding section. Sends the address to `POST /api/waitlist`
 * and shows the confirmation only after the server stored it.
 * `founding` has the primary button, `updates` the outlined one, as in the design.
 */
const props = defineProps<{
  kind: WaitlistKind
  /** Button text. */
  cta: string
  /** Shown in place of the form once the address is stored. */
  done: string
}>()

const inputId = `landing-email-${props.kind}`
const messageId = `${inputId}-message`

const email = ref('')
const message = ref('')
const state = ref<'idle' | 'sending' | 'joined'>('idle')
const input = ref<HTMLInputElement | null>(null)

async function join(): Promise<void> {
  if (state.value !== 'idle') return
  const address = parseWaitlistEmail(email.value)
  if (address === null) {
    message.value = LANDING_COPY.emailInvalid
    input.value?.focus()
    return
  }
  message.value = ''
  state.value = 'sending'
  try {
    await $fetch('/api/waitlist', { method: 'POST', body: { email: address, kind: props.kind } })
    state.value = 'joined'
    // The kind only, never the address.
    track('waitlist_joined', { kind: props.kind })
  } catch (error) {
    const status = (error as { statusCode?: number } | null)?.statusCode
    message.value =
      status === 400 ? LANDING_COPY.emailInvalid : status === 429 ? LANDING_COPY.emailBusy : LANDING_COPY.emailFailed
    state.value = 'idle'
  }
}

const FOCUS = 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary'
const BUTTON = {
  founding:
    'h-[60px] rounded-[18px] bg-primary font-head text-xl font-semibold text-primary-ink shadow-[0_5px_0_var(--pursio-primary-deep)]',
  updates: 'h-[54px] rounded-2xl border-2 border-ink bg-surface font-head text-[17px] font-semibold text-ink',
} as const
</script>

<template>
  <form v-if="state !== 'joined'" class="flex flex-col gap-3.5" novalidate @submit.prevent="join">
    <label :for="inputId" class="text-[13px] font-extrabold tracking-[0.06em] text-muted">
      {{ LANDING_COPY.emailLabel }}
    </label>
    <input
      :id="inputId"
      ref="input"
      v-model="email"
      type="email"
      name="email"
      autocomplete="email"
      :maxlength="EMAIL_MAX_LENGTH"
      :placeholder="LANDING_COPY.emailPlaceholder"
      :aria-describedby="message ? messageId : undefined"
      :aria-invalid="message ? 'true' : undefined"
      class="h-[54px] w-full rounded-2xl border-2 border-line px-4 text-base font-bold text-ink placeholder:text-muted"
      :class="[kind === 'founding' ? 'bg-bg' : 'bg-surface', FOCUS]"
    >
    <p :id="messageId" role="alert" class="text-sm font-bold text-danger-text empty:hidden">{{ message }}</p>
    <button
      type="submit"
      :aria-disabled="state === 'sending' ? 'true' : undefined"
      class="cursor-pointer leading-tight aria-disabled:opacity-70"
      :class="[BUTTON[kind], FOCUS]"
    >
      {{ cta }}
    </button>
  </form>
  <div v-else role="status" class="rounded-2xl border-2 border-done bg-surface p-4 text-base font-extrabold text-ink">
    {{ done }}
  </div>
</template>
