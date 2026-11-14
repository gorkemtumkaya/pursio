<script setup lang="ts">
import { computed, nextTick, shallowRef, toRaw, watch } from 'vue'
import { formatValidationError, loadSkillTree } from '#shared/utils/skill-tree-load'
import sample from '~~/data/sample-bouldering.json'
import PathView from '~/components/path/PathView.vue'
import { getActiveHobbyId, setActiveHobbyId } from '~/utils/active-hobby'
import { activityTimes, cloudEntries, toHobbyLibrary, type CloudPath } from '~/utils/cloud-library'
import { DEMO_ACTIVE_ID, demoHobbyEntries } from '~/utils/demo-placeholders'
import { hobbyPath, NEW_HOBBY_PATH, nextHobbyId, pickHobby, type HobbyLibrary } from '~/utils/hobby-store'
import { progressStorageKey } from '~/utils/progress-store'

/**
 * Chooses which tree `PathView` shows.
 *
 * `?demo=1` renders the Sample_Tree during SSR, with Progress in localStorage
 * and no account or cloud request (spec: accounts-cloud-save, Req 12).
 *
 * Otherwise the learner's paths come from the Cloud_Store. The page waits for
 * a session and for the rows, then picks `?hobby=<id>`, else the Active_Hobby,
 * else the last added hobby (archived hobbies are skipped); an account without
 * paths opens the new hobby page (Req 5.2, 5.11).
 */

// Remount when only the query changes, so switching hobby or to and from ?demo=1 re-chooses.
definePageMeta({ key: route => route.fullPath })

useHead({ title: 'Your path · Pursio' })

const route = useRoute()
const isDemo = route.query.demo === '1'

const sampleLoaded = isDemo ? loadSkillTree(sample) : null

/** First Validation_Error of the Sample_Tree as text, or null. */
const loadError = sampleLoaded && !sampleLoaded.ok ? formatValidationError(sampleLoaded.errors[0]!) : null

/** The Sample_Tree keeps its hobby Progress key in localStorage. */
const demoChoice = sampleLoaded?.ok
  ? {
      tree: sampleLoaded.value,
      progressKey: progressStorageKey(sampleLoaded.value.hobby),
      hobbies: demoHobbyEntries(sampleLoaded.value.hobby),
    }
  : null

const cloud = useCloudStore()
const router = useRouter()
const toast = useToast()
const reset = useProgressReset()

/** Hobby_Id of the path shown here, chosen once the rows are loaded. */
const chosenId = shallowRef<string | null>(null)

const shown = computed<CloudPath | null>(
  () => cloud.paths.value.find((path) => path.record.id === chosenId.value) ?? null,
)

function library(): HobbyLibrary {
  return toHobbyLibrary(cloud.paths.value, getActiveHobbyId())
}

async function choose(): Promise<void> {
  if (isDemo || !import.meta.client || cloud.status.value !== 'ready' || shown.value) return
  const picked = pickHobby(library(), route.query.hobby)
  if (!picked) {
    await navigateTo(NEW_HOBBY_PATH, { replace: true })
    return
  }
  setActiveHobbyId(picked.id)
  chosenId.value = picked.id
}

watch(cloud.status, () => void choose(), { immediate: true })

const hobbies = computed(() => cloudEntries(cloud.paths.value))
const archived = computed(() => cloudEntries(cloud.paths.value, { archived: true }))
const times = computed(() => activityTimes(cloud.paths.value))

/**
 * When the hobby just archived or deleted is the one shown, opens the next one
 * in the list (else the previous one), or the new hobby page when none are left.
 * `before` is the library before the change. Returns true when it navigated.
 */
async function leaveIfShown(id: string, before: HobbyLibrary): Promise<boolean> {
  if (id !== chosenId.value) return false
  const next = nextHobbyId(before, id)
  await navigateTo(next ? hobbyPath(next) : NEW_HOBBY_PATH, { replace: true })
  return true
}

/** Archive: hidden from the lists, tree and Progress kept. A failed save changes nothing (Req 5.12). */
async function onArchiveHobby(id: string): Promise<void> {
  const before = library()
  if (!(await cloud.archive(id))) return
  await leaveIfShown(id, before)
}

async function onRestoreHobby(id: string): Promise<void> {
  await cloud.restore(id)
}

/** Delete (already confirmed): removes the path and its Progress, then offers Undo for a few seconds (Req 5.6). */
async function onDeleteHobby(id: string): Promise<void> {
  const before = library()
  const wasShown = id === chosenId.value
  const removed = await cloud.remove(id)
  if (!removed) return
  toast.show(`${removed.record.tree.hobby} deleted`, { label: 'Undo', run: () => void undoDelete(removed, wasShown) })
  await leaveIfShown(id, before)
}

/**
 * Runs from the app-wide toast, possibly after this page was left: it only
 * uses the Cloud_Store and the router, never this page's state.
 */
async function undoDelete(removed: CloudPath, wasShown: boolean): Promise<void> {
  if (!(await cloud.undoRemove(removed))) return
  if (wasShown) await router.push(hobbyPath(removed.record.id))
}

/** Opens the reset dialog for a hobby of the list; the shown path stays selected (Req 6.2). */
function onResetHobby(id: string): void {
  const hobby = cloud.paths.value.find((path) => path.record.id === id)?.record.tree.hobby
  if (hobby) reset.askReset({ scope: 'path', id, hobby })
}

/** After a reset the dialog returns focus to its opener; if that is gone, focus the hobby list heading (Req 12.3). */
async function onConfirmReset(): Promise<void> {
  if (!(await reset.confirmReset())) return
  await nextTick()
  if (!document.activeElement || document.activeElement === document.body) {
    document.getElementById('sidebar-hobbies')?.focus()
  }
}
</script>

<template>
  <template v-if="isDemo">
    <PathView
      v-if="demoChoice"
      :key="demoChoice.progressKey"
      :tree="demoChoice.tree"
      :progress-key="demoChoice.progressKey"
      demo
      :store="null"
      :activity-times="[]"
      :hobbies="demoChoice.hobbies"
      :archived="[]"
      :active-id="DEMO_ACTIVE_ID"
    />
    <main v-else class="mx-auto w-full max-w-160">
      <PathStatus state="error" :message="loadError ?? undefined" />
    </main>
  </template>

  <AuthSessionGate v-else>
    <PathView
      v-if="shown && cloud.status.value === 'ready'"
      :key="shown.pathId"
      :tree="toRaw(shown.record.tree)"
      :progress-key="shown.pathId"
      :demo="false"
      :store="cloud.progressStore(shown.pathId)"
      :activity-times="times"
      :hobbies="hobbies"
      :archived="archived"
      :active-id="shown.record.id"
      @archive-hobby="onArchiveHobby"
      @delete-hobby="onDeleteHobby"
      :reset-epoch="cloud.resetEpoch.value"
      @restore-hobby="onRestoreHobby"
      @reset-hobby="onResetHobby"
    />
    <main v-else class="mx-auto w-full max-w-160">
      <AuthRetryNotice v-if="cloud.status.value === 'error'" :message="CLOUD_MESSAGES.loadFailed" @retry="cloud.reload" />
      <PathStatus v-else state="loading" />
    </main>
  </AuthSessionGate>

  <ResetProgressDialog
    v-if="!isDemo"
    :open="reset.open.value"
    :scope="reset.target.value.scope"
    :hobby="reset.target.value.scope === 'path' ? reset.target.value.hobby : null"
    :path-count="reset.pathCount.value"
    :mode="reset.mode.value"
    :busy="reset.busy.value"
    :error="reset.error.value"
    @update:mode="reset.setMode"
    @confirm="onConfirmReset"
    @cancel="reset.cancelReset"
  />
</template>
