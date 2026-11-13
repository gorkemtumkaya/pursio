<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { ErrorCode, Provider } from '#shared/types/llm'
import type { Theme } from '#shared/types/theme'
import { KEY_HEADER, MODEL_PRESETS, PROVIDERS, PROVIDER_LABELS } from '#shared/utils/llm'
import { effectiveModel, emptySettings, loadSettings, saveSettings, type LlmSettings } from '~/utils/llm-settings'
import type { StorageLike } from '~/utils/progress-store'
import { errorCodeFrom, friendlyMessage } from '~/utils/tree-client'

/**
 * Settings_Page (design "Settings_Page"). Theme applies at once and is saved in
 * this browser. Provider, model and API key live in this browser only (Req 11);
 * "Test connection" checks them via the Test_Route (Req 12).
 */
useHead({ title: 'Settings · Pursio' })

const { theme, themes, setTheme } = useTheme()
const cloud = useCloudStore()

/** Applies the theme at once, keeps it in this browser and saves it to the account (spec: accounts-cloud-save, Req 7.2, 7.3). */
function chooseTheme(next: Theme): void {
  setTheme(next)
  void cloud.saveTheme(next)
}

const THEME_LABELS: Record<Theme, string> = { boulder: 'Boulder', trail: 'Trail', halloween: 'Halloween' }

/** Client-side limit; the Test_Route itself gives up after 15 s (Req 12.3). */
const TIMEOUT_MS = 20_000

const settings = ref<LlmSettings>(emptySettings())
/** Saving starts only after the stored value is loaded, so it is never overwritten. */
const loaded = ref(false)
const showKey = ref(false)
const testState = ref<'idle' | 'testing'>('idle')
const testResult = ref<string | null>(null)

const presets = computed(() => MODEL_PRESETS[settings.value.provider])
const model = computed(() => effectiveModel(settings.value))
const canTest = computed(() => settings.value.apiKey.trim().length > 0 && testState.value === 'idle')

/** Reading `window.localStorage` can throw (privacy modes, sandboxed frames). */
function browserStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

onMounted(() => {
  settings.value = loadSettings(browserStorage)
  loaded.value = true
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
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="font-display text-3xl text-accent-text">Settings</h1>
      <NuxtLink
        to="/"
        class="rounded-lg text-sm font-bold text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Back
      </NuxtLink>
    </div>

    <section class="rounded-3xl bg-surface p-6">
      <fieldset class="flex flex-col">
        <legend class="mb-3 font-head text-lg font-semibold text-ink">Theme</legend>
        <div class="grid grid-cols-3 gap-3">
          <!-- Each card sets its own data-theme, so it previews that theme with the same tokens. -->
          <label
            v-for="name in themes"
            :key="name"
            :data-theme="name"
            class="flex min-h-11 cursor-pointer flex-col gap-3 rounded-2xl border-2 border-line bg-bg p-3 text-ink has-checked:border-ink has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
          >
            <input
              type="radio"
              name="theme"
              :value="name"
              :checked="theme === name"
              class="sr-only"
              @change="chooseTheme(name)"
            >
            <span aria-hidden="true" class="flex items-center gap-1.5">
              <span class="size-5 rounded-node bg-primary" />
              <span class="size-5 rounded-node bg-done" />
              <span class="size-5 rounded-node bg-gold" />
            </span>
            <span class="flex items-center justify-between gap-1">
              <span class="font-head text-base font-semibold">{{ THEME_LABELS[name] }}</span>
              <PathIcon v-if="theme === name" name="check" class="size-4.5 shrink-0 text-done" />
            </span>
            <span v-if="name === DEFAULT_THEME" class="-mt-2 text-xs font-bold text-muted">Default</span>
          </label>
        </div>
      </fieldset>
    </section>

    <form class="flex flex-col gap-6 rounded-3xl bg-surface p-6" @submit.prevent="testConnection">
      <fieldset class="flex flex-col gap-3">
        <legend class="mb-3 font-head text-lg font-semibold text-ink">AI provider</legend>
        <div class="flex flex-wrap gap-3">
          <label
            v-for="provider in PROVIDERS"
            :key="provider"
            class="flex min-h-11 cursor-pointer items-center gap-2 rounded-node border-2 border-line bg-bg px-4 py-2 text-sm font-bold text-ink has-checked:border-primary has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"
          >
            <input
              type="radio"
              name="provider"
              :value="provider"
              :checked="settings.provider === provider"
              class="accent-primary"
              @change="selectProvider(provider)"
            >
            {{ PROVIDER_LABELS[provider] }}
          </label>
        </div>
      </fieldset>

      <div class="flex flex-col gap-2">
        <label for="model-preset" class="font-head font-semibold text-ink">Model</label>
        <select
          id="model-preset"
          v-model="settings.preset"
          class="h-12 w-full rounded-2xl border-2 border-line bg-bg px-4 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <option v-for="preset in presets" :key="preset" :value="preset">{{ preset }}</option>
        </select>
      </div>

      <div class="flex flex-col gap-2">
        <label for="custom-model" class="font-head font-semibold text-ink">Custom model id</label>
        <input
          id="custom-model"
          v-model="settings.customModel"
          type="text"
          name="custom-model"
          maxlength="100"
          autocomplete="off"
          spellcheck="false"
          placeholder="Optional, overrides the model above"
          class="h-12 w-full rounded-2xl border-2 border-line bg-bg px-4 text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
        <p class="text-sm text-muted">
          Using <span class="font-bold text-ink">{{ model }}</span>
        </p>
      </div>

      <div class="flex flex-col gap-2">
        <label for="api-key" class="font-head font-semibold text-ink">API key</label>
        <div class="flex gap-2">
          <input
            id="api-key"
            v-model="settings.apiKey"
            :type="showKey ? 'text' : 'password'"
            name="api-key"
            autocomplete="off"
            spellcheck="false"
            class="h-12 min-w-0 flex-1 rounded-2xl border-2 border-line bg-bg px-4 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
          <button
            type="button"
            :aria-pressed="showKey"
            class="min-h-11 rounded-node border-2 border-line bg-surface px-4 text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            @click="showKey = !showKey"
          >
            Show
          </button>
          <button
            type="button"
            class="min-h-11 rounded-node border-2 border-line bg-surface px-4 text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            @click="clearKey"
          >
            Clear
          </button>
        </div>
        <p class="text-sm text-muted">Your key is stored only in this browser and sent only to generate your tree.</p>
      </div>

      <button
        type="submit"
        :disabled="!canTest"
        class="h-14 w-full rounded-2xl bg-primary font-head text-lg font-semibold text-primary-ink shadow-raised-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
      >
        Test connection
      </button>

      <p role="status" aria-live="polite" class="min-h-6 text-sm text-ink">
        <template v-if="testState === 'testing'">Testing your key…</template>
        <template v-else-if="testResult">{{ testResult }}</template>
      </p>
    </form>
  </main>
</template>
