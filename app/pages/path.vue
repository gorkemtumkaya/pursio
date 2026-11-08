<script setup lang="ts">
import { onMounted, shallowRef } from 'vue'
import type { SkillTree } from '#shared/types/skill-tree'
import { formatValidationError, loadSkillTree } from '#shared/utils/skill-tree-load'
import sample from '~~/data/sample-bouldering.json'
import PathView from '~/components/path/PathView.vue'
import { DEMO_ACTIVE_ID, demoHobbyEntries } from '~/utils/demo-placeholders'
import {
  hobbyEntries,
  hobbyProgressKey,
  loadHobbyLibrary,
  pickHobby,
  setActiveHobby,
  type HobbyEntry,
} from '~/utils/hobby-store'
import { browserStorage, progressStorageKey } from '~/utils/progress-store'

/**
 * Chooses which tree `PathView` shows. `?demo=1` renders the Sample_Tree during
 * SSR. Otherwise the Hobby_Library lives in localStorage, so SSR and the first
 * client render show the loading state and the choice happens after mount:
 * `?hobby=<id>`, else the Active_Hobby, else the last added hobby; an empty
 * library opens the Start_Screen (spec: local-progress-data, Req 3.6, 3.7).
 */

// Remount when only the query changes, so switching hobby or to and from ?demo=1 re-chooses.
definePageMeta({ key: route => route.fullPath })

useHead({ title: 'Your path · Pursio' })

interface TreeChoice {
  tree: SkillTree
  progressKey: string
  /** Model id for a generated hobby, null for the Sample_Tree. */
  model: string | null
  demo: boolean
  hobbies: HobbyEntry[]
  activeId: string
}

const route = useRoute()
const isDemo = route.query.demo === '1'

const sampleLoaded = isDemo ? loadSkillTree(sample) : null

/** First Validation_Error of the Sample_Tree as text, or null. */
const loadError = sampleLoaded && !sampleLoaded.ok ? formatValidationError(sampleLoaded.errors[0]!) : null

/** The Sample_Tree keeps its hobby Progress key, separate from every library entry. */
const demoChoice: TreeChoice | null = sampleLoaded?.ok
  ? {
      tree: sampleLoaded.value,
      progressKey: progressStorageKey(sampleLoaded.value.hobby),
      model: null,
      demo: true,
      hobbies: demoHobbyEntries(sampleLoaded.value.hobby),
      activeId: DEMO_ACTIVE_ID,
    }
  : null

const choice = shallowRef<TreeChoice | null>(demoChoice)

/** True once the choice is made: at setup for `?demo=1`, after mount otherwise. */
const chosen = shallowRef(isDemo)

onMounted(async () => {
  if (isDemo) return
  const library = loadHobbyLibrary(browserStorage)
  const picked = pickHobby(library, route.query.hobby)
  if (!picked) {
    await navigateTo('/', { replace: true })
    return
  }
  setActiveHobby(browserStorage, picked.id)
  choice.value = {
    tree: picked.tree,
    progressKey: hobbyProgressKey(picked.id),
    model: picked.model,
    demo: false,
    hobbies: hobbyEntries(browserStorage, library),
    activeId: picked.id,
  }
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
    :demo="choice.demo"
    :hobbies="choice.hobbies"
    :active-id="choice.activeId"
  />
  <main v-else class="mx-auto w-full max-w-160">
    <PathStatus v-if="chosen && loadError !== null" state="error" :message="loadError" />
    <PathStatus v-else state="loading" />
  </main>
</template>
