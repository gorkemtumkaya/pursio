<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { bearerHeader } from '#shared/utils/auth'
import { clearActiveHobbyId, clearSavePromptDismissed } from '~/utils/active-hobby'
import { AUTH_MESSAGES, normalizeDisplayName } from '~/utils/auth-logic'

/**
 * Profile_Page (spec: accounts-cloud-save, Req 7.4, 10.4 to 10.6, 11). Display
 * name, account status, the options to save progress or log in, log out for an
 * Account_User, and "Delete my account" for everyone.
 */
useHead({ title: 'Profile · Pursio' })

const DISPLAY_NAME_MAX_LENGTH = 40
/** Client-side limit of the delete request (Req 11.12). */
const DELETE_TIMEOUT_MS = 15_000

const auth = useAuth()
const cloud = useCloudStore()
const dialog = useAuthDialog()
const router = useRouter()

const accountStatus = computed(() => (auth.isAnonymous.value ? 'Guest' : auth.email.value))
/** Shown only to an anonymous learner who has something to keep (Req 10.4, 10.5). */
const showSaveSection = computed(() => auth.isAnonymous.value && cloud.paths.value.length > 0)

// Display name
const displayName = ref('')
const nameState = ref<'idle' | 'saving' | 'saved'>('idle')

watch(
  () => cloud.profile.value?.displayName,
  (stored) => {
    displayName.value = stored ?? ''
  },
  { immediate: true },
)

async function saveName(): Promise<void> {
  if (nameState.value === 'saving') return
  nameState.value = 'saving'
  const entered = displayName.value
  const saved = await cloud.saveDisplayName(entered)
  // On failure the entered name stays on screen (Req 7.5).
  if (saved && displayName.value === entered) displayName.value = normalizeDisplayName(entered) ?? ''
  nameState.value = saved ? 'saved' : 'idle'
}

// Log out
const logoutBusy = ref(false)
const logoutError = ref<string | null>(null)

async function logOut(): Promise<void> {
  if (logoutBusy.value) return
  logoutBusy.value = true
  logoutError.value = null
  const done = await auth.logout()
  logoutBusy.value = false
  if (!done) logoutError.value = AUTH_MESSAGES.logoutFailed
}

// Delete account
const deleteOpen = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<string | null>(null)

function askDelete(): void {
  deleteError.value = null
  deleteOpen.value = true
}

async function requestDelete(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DELETE_TIMEOUT_MS)
  try {
    const token = await auth.accessToken()
    if (token === null) return false
    const response = await $fetch<unknown>('/api/account', {
      method: 'DELETE',
      headers: bearerHeader(token),
      signal: controller.signal,
      retry: 0,
    })
    return typeof response === 'object' && response !== null && (response as Record<string, unknown>).ok === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** One request per confirmation; a failure keeps the dialog open and changes nothing (Req 11.12, 11.15). */
async function confirmDelete(): Promise<void> {
  if (deleteBusy.value) return
  deleteBusy.value = true
  deleteError.value = null
  if (!(await requestDelete())) {
    deleteError.value = AUTH_MESSAGES.deleteFailed
    deleteBusy.value = false
    return
  }
  await auth.endSessionAfterDelete()
  clearActiveHobbyId()
  clearSavePromptDismissed()
  deleteOpen.value = false
  deleteBusy.value = false
  await router.push('/')
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const cardClass = 'flex flex-col gap-4 rounded-3xl bg-surface p-6'
const headingClass = 'font-head text-lg font-semibold text-ink'
const secondaryButtonClass = [
  'flex h-12 items-center justify-center rounded-2xl border-2 border-line bg-surface px-5 font-head text-base font-semibold text-ink disabled:opacity-60',
  focusRing,
]
</script>

<template>
  <AuthSessionGate>
    <main class="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-6">
      <div class="flex items-center justify-between gap-4">
        <h1 class="font-display text-3xl text-accent-text">Profile</h1>
        <NuxtLink to="/" :class="['rounded-lg text-sm font-bold text-accent-text underline', focusRing]">
          Back
        </NuxtLink>
      </div>

      <section :class="cardClass" aria-labelledby="account-title">
        <h2 id="account-title" :class="headingClass">Account</h2>
        <p class="text-base break-words text-ink">
          <span class="font-bold text-muted">Signed in as&nbsp;</span>
          <span class="font-bold">{{ accountStatus }}</span>
        </p>

        <form class="flex flex-col gap-2" @submit.prevent="saveName">
          <label for="display-name" class="font-head font-semibold text-ink">Display name</label>
          <div class="flex gap-2">
            <input
              id="display-name"
              v-model="displayName"
              type="text"
              name="display-name"
              :maxlength="DISPLAY_NAME_MAX_LENGTH"
              autocomplete="nickname"
              placeholder="Optional"
              :class="[
                'h-12 min-w-0 flex-1 rounded-2xl border-2 border-line bg-bg px-4 text-base text-ink placeholder:text-muted',
                focusRing,
              ]"
              @input="nameState = 'idle'"
            >
            <button type="submit" :disabled="nameState === 'saving'" :class="secondaryButtonClass">Save</button>
          </div>
          <p role="status" aria-live="polite" class="min-h-5 text-sm text-muted">
            <template v-if="nameState === 'saving'">Saving…</template>
            <template v-else-if="nameState === 'saved'">Saved.</template>
          </p>
        </form>

        <div class="flex flex-wrap items-center gap-3">
          <NuxtLink to="/settings" :class="secondaryButtonClass">Settings</NuxtLink>
          <button
            v-if="auth.isAnonymous.value"
            type="button"
            :class="['flex h-11 items-center rounded-xl px-2 text-sm font-extrabold text-accent-text underline underline-offset-2', focusRing]"
            @click="dialog.show('login')"
          >
            Log in
          </button>
          <button v-else type="button" :disabled="logoutBusy" :class="secondaryButtonClass" @click="logOut">
            Log out
          </button>
        </div>
        <p v-if="logoutError" role="alert" class="text-sm font-bold text-danger-text">{{ logoutError }}</p>
      </section>

      <section v-if="showSaveSection" :class="cardClass" aria-labelledby="save-title">
        <h2 id="save-title" :class="headingClass">Save your progress</h2>
        <p class="text-[15px] leading-normal text-muted">
          Add Google or your email so you can come back to your paths on any device.
        </p>
        <AuthOptions mode="save" />
      </section>

      <section :class="cardClass" aria-labelledby="delete-title">
        <h2 id="delete-title" :class="headingClass">Delete account</h2>
        <p class="text-[15px] leading-normal text-muted">
          This deletes your paths, your progress and your profile for good.
        </p>
        <button
          type="button"
          :class="['h-12 self-start rounded-2xl bg-danger px-5 font-head text-base font-semibold text-danger-ink shadow-raised-danger', focusRing]"
          @click="askDelete"
        >
          Delete my account
        </button>
      </section>
    </main>

    <PathConfirmDialog
      :open="deleteOpen"
      title="Delete your account?"
      message="All your paths, your progress and your profile are deleted for good. This cannot be undone."
      confirm-label="Delete my account"
      tone="danger"
      :busy="deleteBusy"
      :error="deleteError"
      @confirm="confirmDelete"
      @cancel="deleteOpen = false"
    />
  </AuthSessionGate>
</template>
