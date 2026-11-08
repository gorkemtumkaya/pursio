<script setup lang="ts">
import { ref } from 'vue'
import type { ErrorCode } from '#shared/types/llm'
import { loadSkillTree } from '#shared/utils/skill-tree-load'
import { addHobby, hobbyPath } from '~/utils/hobby-store'
import { loadSettings } from '~/utils/llm-settings'
import type { StorageLike } from '~/utils/progress-store'
import { buildTreeRequest, errorCodeFrom, friendlyMessage } from '~/utils/tree-client'

/**
 * Start_Screen (design "Start_Screen"). Sends the hobby to the Tree_Route,
 * saves the Generated_Tree and opens `/path` (Req 9, 10.1).
 */
useHead({ title: 'Pursio' })

const EXAMPLES = ['bouldering', 'film photography', 'guitar'] as const
/** Client-side limit before the request is aborted (Req 8.2). */
const TIMEOUT_MS = 90_000

const hobby = ref('')
const state = ref<'idle' | 'generating'>('idle')
const error = ref<string | null>(null)

/** Reading `window.localStorage` can throw (privacy modes, sandboxed frames). */
function browserStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function errorData(e: unknown): unknown {
  if (typeof e === 'object' && e !== null && 'data' in e) return (e as { data: unknown }).data
  return undefined
}

async function generate(): Promise<void> {
  const value = hobby.value.trim()
  if (value.length === 0 || state.value === 'generating') return
  const request = buildTreeRequest(value, loadSettings(browserStorage))
  state.value = 'generating'
  error.value = null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let code: ErrorCode
  try {
    const response = await $fetch<unknown>('/api/tree', {
      method: 'POST',
      body: request.body,
      headers: request.headers,
      signal: controller.signal,
      retry: 0,
    })
    const record = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {}
    const loaded = loadSkillTree(record.tree)
    const model = record.model
    if (loaded.ok && typeof model === 'string' && model.length > 0) {
      // Kept in the Hobby_Library next to earlier hobbies (spec: local-progress-data, Req 3.1).
      const id = addHobby(browserStorage, { tree: loaded.value, model })
      await navigateTo(hobbyPath(id))
      return
    }
    code = errorCodeFrom(response)
  } catch (e) {
    code = controller.signal.aborted ? 'timeout' : errorCodeFrom(errorData(e))
  } finally {
    clearTimeout(timer)
  }
  // Leave the Generating_State and keep the typed input (Req 8.4).
  error.value = friendlyMessage(code, { usesOwnKey: request.usesOwnKey })
  state.value = 'idle'
}

function pickExample(example: string): void {
  if (state.value === 'generating') return
  hobby.value = example
  void generate()
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-6 p-6 text-center">
    <div class="flex flex-col gap-3">
      <h1 class="font-display text-4xl text-accent-text">Pursio</h1>
      <p class="text-muted">Turn any hobby into a path you can actually follow.</p>
    </div>

    <form
      class="flex w-full flex-col gap-4 rounded-3xl bg-surface p-6 text-left"
      @submit.prevent="generate"
    >
      <label for="hobby" class="font-head text-lg font-semibold text-ink">What do you want to get better at?</label>
      <input
        id="hobby"
        v-model="hobby"
        type="text"
        name="hobby"
        maxlength="60"
        autocomplete="off"
        placeholder="e.g. bouldering"
        :disabled="state === 'generating'"
        class="h-12 w-full rounded-2xl border-2 border-line bg-bg px-4 text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
      >
      <button
        type="submit"
        :disabled="state === 'generating'"
        class="h-14 w-full rounded-2xl bg-primary font-head text-lg font-semibold text-primary-ink shadow-raised-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
      >
        Build my path
      </button>

      <div class="flex flex-wrap gap-2">
        <button
          v-for="example in EXAMPLES"
          :key="example"
          type="button"
          :disabled="state === 'generating'"
          class="min-h-11 rounded-node border-2 border-line bg-surface px-4 py-2 text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
          @click="pickExample(example)"
        >
          {{ example }}
        </button>
      </div>

      <p role="status" aria-live="polite" class="min-h-6 text-sm text-ink">
        <template v-if="state === 'generating'">Building your skill tree…</template>
        <template v-else-if="error">{{ error }}</template>
      </p>
    </form>

    <NuxtLink
      to="/settings"
      class="rounded-lg text-sm font-bold text-accent-text underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      Settings
    </NuxtLink>
  </main>
</template>
