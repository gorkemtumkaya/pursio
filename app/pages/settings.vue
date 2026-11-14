<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { ErrorCode, Provider } from '#shared/types/llm'
import type { Theme } from '#shared/types/theme'
import { KEY_HEADER, MODEL_PRESETS, PROVIDERS, PROVIDER_LABELS } from '#shared/utils/llm'
import { version } from '~~/package.json'
import { isValidEmail, normalizeDisplayName } from '~/utils/auth-logic'
import { effectiveModel, emptySettings, loadSettings, saveSettings, type LlmSettings } from '~/utils/llm-settings'
import { browserStorage } from '~/utils/progress-store'
import { errorCodeFrom, friendlyMessage } from '~/utils/tree-client'

/**
 * Settings_Page (design "Settings_Page"), in four groups. Account: the email
 * with "Log out", or the save and log-in options for a guest (spec:
 * accounts-cloud-save, Req 10, 11), and the display name (Req 7.4). App: the theme applies at once and is saved
 * in this browser and to the account; provider, model and API key live in this
 * browser only (Req 11), and "Test connection" checks them via the Test_Route
 * (Req 12). About: source and version. Danger zone: "Delete account".
 */
useHead({ title: 'Settings · Pursio' })

const SOURCE_URL = 'https://github.com/gorkemtumkaya/pursio'

const { theme, themes, setTheme } = useTheme()
const auth = useAuth()
const cloud = useCloudStore()
const dialog = useAuthDialog()
const account = useAccountActions()
const { logoutBusy, logoutError, logOut, askDelete } = account
const reset = useProgressReset()

const hasSession = computed(() => auth.status.value === 'anonymous' || auth.status.value === 'signed_in')
/** The save option is shown only to an anonymous learner who has something to keep (Req 10.4, 10.5). */
const showSave = computed(() => auth.isAnonymous.value && cloud.paths.value.length > 0)

/** Applies the theme at once, keeps it in this browser and saves it to the account (spec: accounts-cloud-save, Req 7.2, 7.3). */
function chooseTheme(next: Theme): void {
  setTheme(next)
  void cloud.saveTheme(next)
}

// Display name (spec: accounts-cloud-save, Req 7.4)
const DISPLAY_NAME_MAX_LENGTH = 40
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

/** Client-side limit; the Test_Route itself gives up after 15 s (Req 12.3). */
const TIMEOUT_MS = 20_000

const settings = ref<LlmSettings>(emptySettings())
/** Saving starts only after the stored value is loaded, so it is never overwritten. */
const loaded = ref(false)
const showKey = ref(false)
const testState = ref<'idle' | 'testing'>('idle')
const testResult = ref<string | null>(null)

/** The editors under the "AI model" and "Your own API key" rows. */
const modelOpen = ref(false)
const keyOpen = ref(false)

const presets = computed(() => MODEL_PRESETS[settings.value.provider])
const model = computed(() => effectiveModel(settings.value))
const hasKey = computed(() => settings.value.apiKey.trim().length > 0)
const canTest = computed(() => hasKey.value && testState.value === 'idle')
/** Browsers sometimes autofill the custom model field with the learner's email. */
const customModelLooksLikeEmail = computed(() => isValidEmail(settings.value.customModel))

/** The provider and model are only used together with the learner's own key. */
const modelSummary = computed(() =>
  hasKey.value
    ? `${PROVIDER_LABELS[settings.value.provider]} · ${model.value}`
    : 'Pursio default · builds your paths and quests',
)

onMounted(() => {
  settings.value = loadSettings(browserStorage)
  loaded.value = true
  // Show the warning right away instead of behind "Change".
  if (customModelLooksLikeEmail.value) modelOpen.value = true
})

watch(
  settings,
  (value) => {
    if (!loaded.value) return
    saveSettings(browserStorage, value)
    // A stale "OK" no longer describes the changed settings.
    if (testState.value === 'idle') testResult.value = null
  },
  { deep: true },
)

/** A new provider starts on its first Model_Preset (Req 11.3). */
function selectProvider(provider: Provider): void {
  settings.value.provider = provider
  settings.value.preset = MODEL_PRESETS[provider][0]
}

function clearKey(): void {
  settings.value.apiKey = ''
}

function errorData(e: unknown): unknown {
  if (typeof e === 'object' && e !== null && 'data' in e) return (e as { data: unknown }).data
  return undefined
}

async function testConnection(): Promise<void> {
  const apiKey = settings.value.apiKey.trim()
  if (apiKey.length === 0 || testState.value === 'testing') return
  testState.value = 'testing'
  testResult.value = null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let code: ErrorCode | null = null
  try {
    const response = await $fetch<unknown>('/api/llm-test', {
      method: 'POST',
      body: { provider: settings.value.provider, model: model.value },
      headers: { [KEY_HEADER]: apiKey },
      signal: controller.signal,
      retry: 0,
    })
    const ok = typeof response === 'object' && response !== null && (response as Record<string, unknown>).ok === true
    if (!ok) code = errorCodeFrom(response)
  } catch (e) {
    code = controller.signal.aborted ? 'timeout' : errorCodeFrom(errorData(e))
  } finally {
    clearTimeout(timer)
  }
  testResult.value = code === null ? 'OK' : friendlyMessage(code, { usesOwnKey: true })
  testState.value = 'idle'
}

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const groupLabelClass = 'px-0.5 text-[13px] font-extrabold tracking-widest text-muted uppercase'
const cardClass = 'flex flex-col rounded-3xl border-2 border-line bg-surface'
const rowClass = 'flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 lg:px-5'
const dividerClass = 'border-line not-last:border-b-2'
const rowTextClass = 'flex min-w-0 flex-[1_1_200px] flex-col'
const rowTitleClass = 'text-base font-extrabold break-words text-ink'
const rowHintClass = 'text-[13px] font-bold break-words text-muted'
const plainButtonClass = [
  'flex h-11 shrink-0 items-center justify-center rounded-2xl border-2 border-line bg-surface px-4 font-head text-[15px] font-semibold text-ink hover:border-ink disabled:opacity-60',
  focusRing,
]
const fieldClass = [
  'h-12 w-full rounded-2xl border-2 border-line bg-bg px-4 text-base text-ink placeholder:text-muted',
  focusRing,
]
const fieldLabelClass = 'font-head text-[15px] font-semibold text-ink'
</script>

<template>
  <AppShell>
    <main class="mx-auto flex w-full max-w-203 min-w-0 flex-col gap-3 px-4 pt-4 pb-26 lg:px-8 lg:pt-7 lg:pb-12">
      <div class="mb-2 flex items-center gap-3.5">
        <NuxtLink to="/profile" :class="[plainButtonClass, 'gap-1 pr-4 pl-2.5']">
          <PathIcon name="chevron" class="size-4.5 rotate-90" />
          Profile
        </NuxtLink>
        <h1 class="font-display text-[28px] leading-none font-semibold text-ink lg:text-[32px]">Settings</h1>
      </div>

      <h2 id="settings-account" :class="groupLabelClass">Account</h2>
      <section aria-labelledby="settings-account" :class="cardClass">
        <div v-if="!hasSession" :class="rowClass">
          <span :class="rowTextClass">
            <b :class="rowTitleClass">Account</b>
            <span role="status" :class="rowHintClass">
              {{ auth.status.value === 'unavailable' ? AUTH_MESSAGES.unavailable : 'Loading…' }}
            </span>
          </span>
          <button v-if="auth.status.value === 'unavailable'" type="button" :class="plainButtonClass" @click="auth.retry">
            Try again
          </button>
        </div>
        <div v-else-if="auth.isAnonymous.value" :class="rowClass">
          <span :class="rowTextClass">
            <b :class="rowTitleClass">Guest</b>
            <span :class="rowHintClass">
              {{ showSave ? 'Not signed in · your paths can only be opened on this device' : 'Not signed in' }}
            </span>
          </span>
          <div class="flex flex-wrap gap-2">
            <button
              v-if="showSave"
              type="button"
              :class="[
                'flex h-11 items-center justify-center rounded-2xl bg-primary px-4 font-head text-[15px] font-semibold text-primary-ink shadow-raised-primary',
                focusRing,
              ]"
              @click="dialog.show('save')"
            >
              Save progress
            </button>
            <button type="button" :class="plainButtonClass" @click="dialog.show('login')">Log in</button>
          </div>
        </div>
        <div v-else :class="rowClass">
          <span :class="rowTextClass">
            <b :class="rowTitleClass">{{ auth.email.value }}</b>
            <span :class="rowHintClass">Signed in · progress is saved</span>
            <span v-if="logoutError" role="alert" class="text-[13px] font-bold text-danger-text">{{ logoutError }}</span>
          </span>
          <button type="button" :disabled="logoutBusy" :class="plainButtonClass" @click="logOut">Log out</button>
        </div>

        <form v-if="hasSession" :class="[rowClass, 'border-t-2 border-line']" @submit.prevent="saveName">
          <span :class="rowTextClass">
            <label for="display-name" :class="rowTitleClass">Display name</label>
            <span role="status" aria-live="polite" :class="rowHintClass">
              <template v-if="nameState === 'saving'">Saving…</template>
              <template v-else-if="nameState === 'saved'">Saved.</template>
              <template v-else>The name on your profile</template>
            </span>
          </span>
          <div class="flex min-w-0 flex-[1_1_240px] gap-2 lg:flex-none lg:basis-80">
            <input
              id="display-name"
              v-model="displayName"
              type="text"
              name="display-name"
              :maxlength="DISPLAY_NAME_MAX_LENGTH"
              autocomplete="nickname"
              placeholder="Optional"
              :class="[
                'h-11 min-w-0 flex-1 rounded-2xl border-2 border-line bg-bg px-4 text-base text-ink placeholder:text-muted',
                focusRing,
              ]"
              @input="nameState = 'idle'"
            >
            <button type="submit" :disabled="nameState === 'saving'" :class="plainButtonClass">Save</button>
          </div>
        </form>
      </section>

      <h2 id="settings-app" :class="[groupLabelClass, 'mt-3']">App</h2>
      <section aria-labelledby="settings-app" :class="cardClass">
        <div :class="[rowClass, dividerClass]">
          <b id="settings-theme" :class="rowTitleClass">Theme</b>
          <div role="group" aria-labelledby="settings-theme" class="flex rounded-2xl bg-surface-2">
            <button
              v-for="name in themes"
              :key="name"
              type="button"
              :aria-pressed="theme === name"
              :class="[
                'h-11 rounded-2xl border-2 px-3.5 text-[15px] font-extrabold text-ink',
                theme === name ? 'border-ink bg-surface' : 'border-transparent hover:border-line',
                focusRing,
              ]"
              @click="chooseTheme(name)"
            >
              {{ THEME_LABELS[name] }}
            </button>
          </div>
        </div>

        <div :class="dividerClass">
          <div :class="rowClass">
            <span :class="rowTextClass">
              <b :class="rowTitleClass">AI model</b>
              <span :class="rowHintClass">{{ modelSummary }}</span>
            </span>
            <button
              type="button"
              :aria-expanded="modelOpen"
              aria-controls="settings-model-panel"
              :class="plainButtonClass"
              @click="modelOpen = !modelOpen"
            >
              {{ modelOpen ? 'Done' : 'Change' }}
            </button>
          </div>
          <div v-show="modelOpen" id="settings-model-panel" class="flex flex-col gap-4 px-4 pb-5 lg:px-5">
            <p v-if="!hasKey" class="rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold text-muted">
              Your choice is used once you add your own API key. Until then Pursio uses its default model.
            </p>
            <fieldset class="flex flex-col gap-2">
              <legend :class="[fieldLabelClass, 'mb-2']">Provider</legend>
              <div class="flex flex-wrap gap-2">
                <label
                  v-for="provider in PROVIDERS"
                  :key="provider"
                  class="flex h-11 cursor-pointer items-center rounded-2xl border-2 border-line bg-bg px-4 text-sm font-extrabold text-ink has-checked:border-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
                >
                  <input
                    type="radio"
                    name="provider"
                    :value="provider"
                    :checked="settings.provider === provider"
                    class="sr-only"
                    @change="selectProvider(provider)"
                  >
                  {{ PROVIDER_LABELS[provider] }}
                </label>
              </div>
            </fieldset>
            <div class="flex flex-col gap-2">
              <label for="model-preset" :class="fieldLabelClass">Model</label>
              <select id="model-preset" v-model="settings.preset" :class="fieldClass">
                <option v-for="preset in presets" :key="preset" :value="preset">{{ preset }}</option>
              </select>
            </div>
            <div class="flex flex-col gap-2">
              <label for="custom-model" :class="fieldLabelClass">Custom model id</label>
              <input
                id="custom-model"
                v-model="settings.customModel"
                type="text"
                name="llm-model-override"
                maxlength="100"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                placeholder="Optional, overrides the model above"
                :aria-invalid="customModelLooksLikeEmail"
                :aria-describedby="customModelLooksLikeEmail ? 'custom-model-warning' : undefined"
                :class="fieldClass"
              >
              <p v-if="customModelLooksLikeEmail" id="custom-model-warning" class="text-sm font-bold text-danger-text">
                This looks like an email address, not a model id. Your browser may have filled it in.
                <button
                  type="button"
                  :class="['ml-1 rounded-sm underline underline-offset-2', focusRing]"
                  @click="settings.customModel = ''"
                >
                  Clear it
                </button>
              </p>
              <p class="text-sm text-muted">
                Using <span class="font-bold text-ink">{{ model }}</span>
              </p>
            </div>
          </div>
        </div>

        <div :class="dividerClass">
          <div :class="rowClass">
            <span :class="rowTextClass">
              <b :class="rowTitleClass">Your own API key</b>
              <span :class="rowHintClass">{{ hasKey ? 'Set' : 'Not set' }} · stored only on this device</span>
            </span>
            <button
              type="button"
              :aria-expanded="keyOpen"
              aria-controls="settings-key-panel"
              :class="plainButtonClass"
              @click="keyOpen = !keyOpen"
            >
              {{ keyOpen ? 'Done' : hasKey ? 'Change key' : 'Add key' }}
            </button>
          </div>
          <form
            v-show="keyOpen"
            id="settings-key-panel"
            class="flex flex-col gap-3 px-4 pb-5 lg:px-5"
            @submit.prevent="testConnection"
          >
            <label for="api-key" :class="fieldLabelClass">API key</label>
            <div class="flex flex-wrap gap-2">
              <input
                id="api-key"
                v-model="settings.apiKey"
                :type="showKey ? 'text' : 'password'"
                name="api-key"
                autocomplete="off"
                spellcheck="false"
                :class="[fieldClass, 'min-w-0 flex-[1_1_200px]']"
              >
              <button type="button" :aria-pressed="showKey" :class="[plainButtonClass, 'h-12']" @click="showKey = !showKey">
                Show
              </button>
              <button type="button" :class="[plainButtonClass, 'h-12']" @click="clearKey">Clear</button>
            </div>
            <p class="text-sm text-muted">
              Your key is sent only to build your paths, with the {{ PROVIDER_LABELS[settings.provider] }} model above.
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                :disabled="!canTest"
                :class="[
                  'h-12 rounded-2xl bg-primary px-5 font-head text-base font-semibold text-primary-ink shadow-raised-primary disabled:opacity-60',
                  focusRing,
                ]"
              >
                Test connection
              </button>
              <p role="status" aria-live="polite" class="min-w-0 flex-1 text-sm font-bold text-ink">
                <template v-if="testState === 'testing'">Testing your key…</template>
                <template v-else-if="testResult">{{ testResult }}</template>
              </p>
            </div>
          </form>
        </div>
      </section>

      <h2 id="settings-about" :class="[groupLabelClass, 'mt-3']">About</h2>
      <section aria-labelledby="settings-about" :class="cardClass">
        <a
          :href="SOURCE_URL"
          target="_blank"
          rel="noopener"
          :class="[rowClass, dividerClass, 'min-h-15 rounded-t-3xl', focusRing]"
        >
          <b :class="rowTitleClass">Source code and license</b>
          <PathIcon name="chevron" class="size-4.5 -rotate-90 text-muted" />
        </a>
        <div :class="[rowClass, dividerClass, 'min-h-15']">
          <b :class="rowTitleClass">Version</b>
          <span class="text-[15px] font-bold text-muted">{{ version }}</span>
        </div>
      </section>

      <template v-if="hasSession">
        <h2 id="settings-danger" :class="[groupLabelClass, 'mt-3']">Danger zone</h2>
        <section aria-labelledby="settings-danger" :class="cardClass">
          <div :class="[rowClass, dividerClass]">
            <span :class="rowTextClass">
              <b :class="rowTitleClass">Reset all progress</b>
              <span :class="rowHintClass">Starts every path over. Your paths stay</span>
            </span>
            <button
              type="button"
              :disabled="cloud.paths.value.length === 0"
              :class="[
                'flex h-11 shrink-0 items-center justify-center rounded-2xl border-2 border-danger bg-surface px-4 font-head text-[15px] font-semibold text-danger-text disabled:opacity-60',
                focusRing,
              ]"
              @click="reset.askReset({ scope: 'all' })"
            >
              Reset all progress
            </button>
          </div>
          <div :class="rowClass">
            <span :class="rowTextClass">
              <b :class="rowTitleClass">Delete account</b>
              <span :class="rowHintClass">Removes your account, paths and progress for good</span>
            </span>
            <button
              type="button"
              :class="[
                'flex h-11 shrink-0 items-center justify-center rounded-2xl border-2 border-danger bg-surface px-4 font-head text-[15px] font-semibold text-danger-text',
                focusRing,
              ]"
              @click="askDelete"
            >
              Delete account
            </button>
          </div>
        </section>
      </template>
    </main>
  </AppShell>

  <AccountDeleteDialog
    :open="account.deleteOpen.value"
    :busy="account.deleteBusy.value"
    :error="account.deleteError.value"
    @confirm="account.confirmDelete"
    @cancel="account.cancelDelete"
  />

  <ResetProgressDialog
    :open="reset.open.value"
    scope="all"
    :hobby="null"
    :path-count="reset.pathCount.value"
    :mode="reset.mode.value"
    :busy="reset.busy.value"
    :error="reset.error.value"
    @update:mode="reset.setMode"
    @confirm="reset.confirmReset"
    @cancel="reset.cancelReset"
  />
</template>
