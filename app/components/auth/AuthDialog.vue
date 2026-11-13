<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useFocusTrap } from '~/composables/useFocusTrap'
import { dismissSavePrompt } from '~/utils/active-hobby'

/**
 * Auth_Dialog (spec: accounts-cloud-save, Req 4.11, 10.2, 10.3). Mounted once
 * in `app.vue` and opened through `useAuthDialog`. Focus moves inside on open
 * and stays there; Escape, a backdrop tap or the close button close it, leave
 * the session unchanged and return focus to the opener. The `prompt` variant
 * is the Save_Prompt: closing it stores the dismissed flag, so it does not
 * open by itself again on this device.
 */
const dialog = useAuthDialog()
const auth = useAuth()
const router = useRouter()

const card = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLElement | null>(null)
const open = computed(() => dialog.state.value.open)
const mode = computed(() => dialog.state.value.mode)
const isPrompt = computed(() => dialog.state.value.variant === 'prompt')
const titleId = useId()
const textId = useId()

const title = computed(() => (mode.value === 'save' ? 'Save your progress' : 'Log in'))
const text = computed(() =>
  mode.value === 'save'
    ? 'Add Google or your email so you can come back to your paths on any device.'
    : 'Use Google or your email to open the paths saved in your account.',
)

/** Closed by the learner. A sign-in that finishes closes the dialog without the flag. */
function closeByUser(): void {
  if (isPrompt.value) dismissSavePrompt()
  dialog.close()
}

useFocusTrap(card, { active: open, initialFocus: closeButton, onEscape: closeByUser })

let opener: HTMLElement | null = null
watch(open, (isOpen) => {
  if (!import.meta.client) return
  if (isOpen) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return
  }
  const target = opener
  opener = null
  if (target?.isConnected) target.focus()
})

// Sign-in finished while the dialog is open, e.g. the magic link was opened in another tab.
watch([auth.userId, auth.isAnonymous], ([id, anonymous], [previousId]) => {
  if (!open.value || id === '') return
  if (mode.value === 'login') {
    if (previousId === '' || id === previousId) return
    dialog.close()
    void router.push('/')
  } else if (!anonymous) {
    dialog.close()
  }
})

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 motion-reduce:transition-none"
      leave-active-class="transition-opacity duration-150 motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-60 flex items-center justify-center overflow-y-auto bg-overlay p-5"
        @click.self="closeByUser"
      >
        <div
          ref="card"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          :aria-describedby="textId"
          class="flex w-full max-w-sm flex-col items-center gap-2 rounded-3xl bg-surface px-6 pt-6 pb-4 text-center shadow-raised-line"
        >
          <h2 :id="titleId" class="font-head text-2xl leading-tight font-semibold text-ink">{{ title }}</h2>
          <p :id="textId" class="mb-2 text-[15px] leading-normal text-muted">{{ text }}</p>
          <AuthOptions :key="mode" :mode="mode" :initial-error="dialog.state.value.error" />
          <button
            ref="closeButton"
            type="button"
            :class="[
              'mt-1 flex h-11 items-center rounded-xl px-3 text-sm font-extrabold text-accent-text underline underline-offset-2',
              focusRing,
            ]"
            @click="closeByUser"
          >
            {{ isPrompt ? 'Not now' : 'Close' }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
