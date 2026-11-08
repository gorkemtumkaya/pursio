<script setup lang="ts">
import { onMounted, shallowRef, watch } from 'vue'
import type { SkillTree } from '#shared/types/skill-tree'
import { formatValidationError, loadSkillTree } from '#shared/utils/skill-tree-load'
import sample from '~~/data/sample-bouldering.json'
import PathView from '~/components/path/PathView.vue'
import { DEMO_ACTIVE_ID, demoHobbyEntries } from '~/utils/demo-placeholders'
import {
  archiveHobby,
  hobbyEntries,
  hobbyPath,
  hobbyProgressKey,
  loadHobbyLibrary,
  NEW_HOBBY_PATH,
  nextHobbyId,
  pickHobby,
  removeHobby,
  restoreHobby,
  setActiveHobby,
  undoRemoveHobby,
  type HobbyEntry,
  type HobbyLibrary,
  type RemovedHobby,
} from '~/utils/hobby-store'
import { browserStorage, progressStorageKey } from '~/utils/progress-store'

/**
 * Chooses which tree `PathView` shows. `?demo=1` renders the Sample_Tree during
 * SSR. Otherwise the Hobby_Library lives in localStorage, so SSR and the first
 * client render show the loading state and the choice happens after mount:
 * `?hobby=<id>`, else the Active_Hobby, else the last added hobby (archived
 * hobbies are skipped); an empty library opens the new hobby page (spec: local-progress-data, Req 3.6, 3.7).
 */

// Remount when only the query changes, so switching hobby or to and from ?demo=1 re-chooses.
definePageMeta({ key: route => route.fullPath })

useHead({ title: 'Your path · Pursio' })

interface TreeChoice {
  tree: SkillTree
  progressKey: string
  demo: boolean
  hobbies: HobbyEntry[]
  archived: HobbyEntry[]
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
      demo: true,
      hobbies: demoHobbyEntries(sampleLoaded.value.hobby),
      archived: [],
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
    await navigateTo(NEW_HOBBY_PATH, { replace: true })
    return
  }
  setActiveHobby(browserStorage, picked.id)
  choice.value = {
    tree: picked.tree,
    progressKey: hobbyProgressKey(picked.id),
    demo: false,
    hobbies: hobbyEntries(browserStorage, library),
    archived: hobbyEntries(browserStorage, library, { archived: true }),
    activeId: picked.id,
  }
  chosen.value = true
})

const router = useRouter()
const toast = useToast()
const { revision, bump } = useLibraryRevision()

/** Reloads both hobby lists, e.g. after an Undo from the toast. */
function refreshLists(library: HobbyLibrary = loadHobbyLibrary(browserStorage)): void {
  const current = choice.value
  if (!current || current.demo) return
  choice.value = {
    ...current,
    hobbies: hobbyEntries(browserStorage, library),
    archived: hobbyEntries(browserStorage, library, { archived: true }),
  }
}

watch(revision, () => refreshLists())

/**
 * When the hobby just archived or deleted is the one shown, opens the next one
 * in the list (else the previous one), or the new hobby page when none are left.
 * `before` is the library before the change. Returns true when it navigated.
 */
async function leaveIfShown(id: string, before: HobbyLibrary): Promise<boolean> {
  if (id !== choice.value?.activeId) return false
  const next = nextHobbyId(before, id)
  await navigateTo(next ? hobbyPath(next) : NEW_HOBBY_PATH, { replace: true })
  return true
}

/** Archive: hidden from the lists, tree and Progress kept. */
async function onArchiveHobby(id: string): Promise<void> {
  if (choice.value?.demo !== false) return
  const before = loadHobbyLibrary(browserStorage)
  const library = archiveHobby(browserStorage, id)
  // Not archived: storage could not be written, so nothing changed.
  if (!library.hobbies.find((h) => h.id === id)?.archived) return
  if (await leaveIfShown(id, before)) return
  refreshLists(library)
}

function onRestoreHobby(id: string): void {
  if (choice.value?.demo !== false) return
  refreshLists(restoreHobby(browserStorage, id))
}

/** Delete (already confirmed): removes tree and Progress, then offers Undo for a few seconds. */
async function onDeleteHobby(id: string): Promise<void> {
  if (choice.value?.demo !== false) return
  const before = loadHobbyLibrary(browserStorage)
  const { library, removed } = removeHobby(browserStorage, id)
  if (!removed) return
  toast.show(`${removed.record.tree.hobby} deleted`, { label: 'Undo', run: () => undoDelete(removed) })
  if (await leaveIfShown(id, before)) return
  refreshLists(library)
}

/**
 * Runs from the app-wide toast, possibly after this page was left: it only
 * uses the router and the revision signal, never this page's state.
 */
function undoDelete(removed: RemovedHobby): void {
  undoRemoveHobby(browserStorage, removed)
  bump()
  if (removed.wasActive) void router.push(hobbyPath(removed.record.id))
}
</script>

<template>
  <PathView
    v-if="choice"
    :key="choice.progressKey"
    :tree="choice.tree"
    :progress-key="choice.progressKey"
    :demo="choice.demo"
    :hobbies="choice.hobbies"
    :archived="choice.archived"
    :active-id="choice.activeId"
    @archive-hobby="onArchiveHobby"
    @delete-hobby="onDeleteHobby"
    @restore-hobby="onRestoreHobby"
  />
  <main v-else class="mx-auto w-full max-w-160">
    <PathStatus v-if="chosen && loadError !== null" state="error" :message="loadError" />
    <PathStatus v-else state="loading" />
  </main>
</template>
