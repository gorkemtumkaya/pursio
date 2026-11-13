<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { AUTH_MESSAGES, authFailureMessage, isValidEmail, type AuthMode } from '~/utils/auth-logic'

/**
 * The sign-in options of the Auth_Dialog (spec: accounts-cloud-save, Req 4):
 * "Continue with Google" and an email field with "Email me a link". There is
 * no password. `save` mode upgrades the anonymous user; `login` mode signs in
 * to an existing account and warns an anonymous learner who has paths that
 * they stay behind (Req 4.8). Both buttons are disabled while a request runs
 * (Req 4.14).
 */
const props = withDefaults(defineProps<{ mode: AuthMode; initialError?: string | null }>(), { initialError: null })

const auth = useAuth()
const cloud = useCloudStore()

const emailId = useId()
const errorId = useId()

const email = ref('')
const busy = ref(false)
const error = ref<string | null>(props.initialError)
/** The address a link was sent to; set once the request succeeded. */
const sentTo = ref<string | null>(null)

const showLoginWarning = computed(
  () => props.mode === 'login' && auth.isAnonymous.value && cloud.paths.value.length > 0,
)

async function continueWithGoogle(): Promise<void> {
  if (busy.value) return
  busy.value = true
  error.value = null
  const failure = await auth.startGoogle(props.mode)
  // No failure means the browser is leaving for Google; the buttons stay disabled.
  if (failure === null) return
  error.value = authFailureMessage(failure)
  busy.value = false
}

async function sendLink(): Promise<void> {
  if (busy.value) return
  error.value = null
  if (!isValidEmail(email.value)) {
    error.value = AUTH_MESSAGES.invalidEmail
    return
  }
  busy.value = true
  const address = email.value.trim()
  const result = await auth.sendEmail(props.mode, address)
  busy.value = false
  if (result === 'sent') sentTo.value = address
  else if (result === 'invalid') error.value = AUTH_MESSAGES.invalidEmail
  else error.value = authFailureMessage(result)
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
</script>

<template>
  <div class="flex w-full flex-col gap-3 text-left">
    <p
      v-if="showLoginWarning"
      class="rounded-2xl border-2 border-line bg-bg px-4 py-3 text-sm leading-normal font-bold text-ink"
    >
      {{ AUTH_MESSAGES.loginWarning }}
    </p>

    <div v-if="sentTo" role="status" class="rounded-2xl border-2 border-line bg-bg px-4 py-4 text-center">
      <p class="font-head text-lg font-semibold text-ink">Check your email</p>
      <p class="mt-1 text-[15px] leading-normal break-words text-muted">
        We sent a link to <span class="font-bold text-ink">{{ sentTo }}</span>. Open it to finish.
      </p>
    </div>

    <template v-else>
      <button
        type="button"
        :disabled="busy"
        :class="[
          'h-12 w-full rounded-2xl bg-primary font-head text-base font-semibold text-primary-ink shadow-raised-primary disabled:opacity-60',
          focusRing,
        ]"
        @click="continueWithGoogle"
      >
        Continue with Google
      </button>

      <p aria-hidden="true" class="text-center text-xs font-extrabold tracking-[0.06em] text-muted uppercase">or</p>

      <form novalidate class="flex flex-col gap-2" @submit.prevent="sendLink">
        <label :for="emailId" class="font-head font-semibold text-ink">Email</label>
        <input
          :id="emailId"
          v-model="email"
          type="email"
          name="email"
          autocomplete="email"
          inputmode="email"
          spellcheck="false"
          maxlength="254"
          placeholder="you@example.com"
          :aria-invalid="error !== null"
          :aria-describedby="error !== null ? errorId : undefined"
          :class="[
            'h-12 w-full rounded-2xl border-2 border-line bg-bg px-4 text-base text-ink placeholder:text-muted',
            focusRing,
          ]"
        >
        <button
          type="submit"
          :disabled="busy"
          :class="[
            'h-12 w-full rounded-2xl border-2 border-line bg-surface font-head text-base font-semibold text-ink disabled:opacity-60',
            focusRing,
          ]"
        >
          Email me a link
        </button>
      </form>
    </template>

    <p v-if="error" :id="errorId" role="alert" class="text-sm leading-normal font-bold text-danger-text">
      {{ error }}
    </p>
  </div>
</template>
