<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import type { SkillTree } from '#shared/types/skill-tree'
import { formatValidationError, loadSkillTree } from '#shared/utils/skill-tree-load'
import sample from '~~/data/sample-bouldering.json'
import PathView from '~/components/path/PathView.vue'
import { GENERATED_PROGRESS_KEY, loadGeneratedTree } from '~/utils/generated-tree'
import { progressStorageKey, type StorageLike } from '~/utils/progress-store'

/**
 * Chooses which tree `PathView` shows (design "Lifecycle and hydration on /path").
 * `?demo=1` renders the Sample_Tree during SSR (Req 10.4). Otherwise the saved
 * Generated_Tree lives in localStorage, so SSR and the first client render show
 * the loading state and the choice happens after mount (Req 10.3, 10.5, 10.6).
 */

// Remount when only the query changes, so switching to or from ?demo=1 re-chooses.
definePageMeta({ key: route => route.fullPath })

useHead({ title: 'Your path · Pursio' })

interface TreeChoice {
  tree: SkillTree
  progressKey: string
  /** Model id for a Generated_Tree, null for the Sample_Tree. */
  model: string | null
}

const route = useRoute()
const isDemo = route.query.demo === '1'

const sampleLoaded = loadSkillTree(sample)

/** First Validation_Error as text, or null when the Sample_Tree is valid (Req 3.8). */
const loadError = sampleLoaded.ok ? null : formatValidationError(sampleLoaded.errors[0]!)

/** Sample_Tree keeps its hobby Progress key, separate from the Generated_Tree (Req 10.2). */
const sampleChoice: TreeChoice | null = sampleLoaded.ok
  ? { tree: sampleLoaded.value, progressKey: progressStorageKey(sampleLoaded.value.hobby), model: null }
  : null

const choice = shallowRef<TreeChoice | null>(isDemo ? sampleChoice : null)

/** True once the choice is made: at setup for `?demo=1`, after mount otherwise. */
const chosen = shallowRef(isDemo)

/** Reading `window.localStorage` can throw (privacy modes, sandboxed frames). */
function browserStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

onMounted(() => {
  if (isDemo) return
  // An invalid saved value is removed by the loader (Req 10.6).
  const generated = loadGeneratedTree(browserStorage)
  choice.value = generated
    ? { tree: generated.tree, progressKey: GENERATED_PROGRESS_KEY, model: generated.model }
    : sampleChoice
  chosen.value = true
})
</script>

<template>
  <PathView
    v-if="choice"
    :key="choice.progressKey"
    :tree="choice.tree"
    :progress-key="choice.progressKey"
    :model="choice.model"
  />
  <main v-else class="mx-auto w-full max-w-160">
    <PathStatus v-if="chosen && loadError !== null" state="error" :message="loadError" />
    <PathStatus v-else state="loading" />
  </main>
</template>
