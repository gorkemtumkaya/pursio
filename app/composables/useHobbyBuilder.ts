import { computed, onScopeDispose, readonly, ref, shallowRef, watch } from 'vue'
import type { FinalProfile } from '#shared/types/learner-profile'
import type { ErrorCode } from '#shared/types/llm'
import { bearerHeader } from '#shared/utils/auth'
import { startLevelFor } from '#shared/utils/learner-profile'
import { countedHobbies, hobbyLimitBlocks, type LimitHobby } from '#shared/utils/hobby-limit'
import { normalizeHobby } from '#shared/utils/llm'
import { loadSkillTree } from '#shared/utils/skill-tree-load'
import { track } from '~/utils/analytics'
import { hobbyPath, readTreeWithProfile } from '~/utils/hobby-store'
import { buildIntakeRequest, runIntake } from '~/utils/intake-client'
import {
  answeredProps,
  finalProfile,
  openPanel,
  removeChip as removePanelChip,
  shownProps,
  toggleGoal as togglePanelGoal,
  toggleOption,
  type PanelState,
  type ProfileField,
} from '~/utils/intake-panel'
import { loadSettings } from '~/utils/llm-settings'
import type { StorageLike } from '~/utils/progress-store'
import { buildTreeRequest, errorCodeFrom, friendlyMessage } from '~/utils/tree-client'
import { summarizeTree, type TreeSummary } from '~/utils/tree-summary'
import { effectiveLanguage, loadUserSettings } from '~/utils/user-settings'
import { toWickOutfit, type WickOutfit } from '~/utils/wick'

/**
 * `reading`: intake runs. `panel`: the Panel is open under the inputs (spec: path-intake).
 * `limit`: the free plan's hobby limit stopped the build; the page shows the limit card.
 * The other states are those of the new-hobby-page spec.
 */
export type BuilderState = 'input' | 'reading' | 'panel' | 'generating' | 'ready' | 'error' | 'limit'

export const BUILD_STEPS = [
  'Mapping the skills',
  'Putting them in order',
  'Writing quests for each skill',
  'Picking Wick’s outfit',
] as const

/** Time between two building steps while the request runs. */
export const STEP_INTERVAL_MS = 3500
/** Client-side limit before the request is aborted (Req 8.2). */
export const TIMEOUT_MS = 90_000

const SURPRISE_POOL = [
  'pottery',
  'birdwatching',
  'calligraphy',
  'skateboarding',
  'origami',
  'trail running',
] as const

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

/** State and actions of the new hobby page (specs: new-hobby-page, path-intake). */
export function useHobbyBuilder() {
  const hobby = ref('')
  /** The optional "Tell Wick more" text. Kept in memory only, never stored (spec: path-intake, AS7). */
  const note = ref('')
  const state = ref<BuilderState>('input')
  const panel = shallowRef<PanelState | null>(null)
  const stepIndex = ref(0)
  const errorCode = ref<ErrorCode | null>(null)
  const errorMessage = ref<string | null>(null)
  const summary = ref<TreeSummary | null>(null)
  const outfit = ref<WickOutfit>('none')
  const auth = useAuth()
  const cloud = useCloudStore()
  const { $posthog: posthog } = useNuxtApp()
  const billing = useBillingStatus()

  /** The account's hobbies as the limit sees them. The demo path is never among the account's paths. */
  function limitHobbies(): LimitHobby[] {
    return cloud.paths.value.map((path) => ({
      hobbyId: path.record.id,
      hobby: path.record.tree.hobby,
      archived: path.record.archived,
    }))
  }

  /**
   * Whether the page itself can tell that the limit stops a build of `requested` (null: any
   * new hobby). This only saves a wasted request; the tree route decides. While the paths or
   * the plan are not loaded, nothing is stopped here. The plan comes from the server's billing
   * status; a guest has none.
   */
  function blockedByLimit(requested: string | null): boolean {
    if (cloud.status.value !== 'ready') return false
    const signedIn = auth.status.value === 'signed_in'
    if (signedIn && billing.status.value === null) return false
    const unlimited = signedIn && billing.status.value?.access === true
    return hobbyLimitBlocks({ hobbies: limitHobbies(), requested, unlimited })
  }

  /** True when the account cannot add any new hobby: the page shows the limit card instead of the form. */
  const limitReached = computed(() => blockedByLimit(null))
  /** Active hobbies that count toward the limit. */
  const activeHobbyCount = computed(() => countedHobbies(limitHobbies()).length)

  let hobbyId: string | null = null
  /** True while the token is read, so a second submit does not start a second request. */
  let preparing = false
  let timer: ReturnType<typeof setInterval> | null = null
  let controller: AbortController | null = null
  let intakeController: AbortController | null = null
  let disposed = false
  /** What the last generation was for, so "Try again" can reuse it (Req 13.2). */
  let lastBuild: { hobby: string; profile: FinalProfile | null } | null = null

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  function startTimer(): void {
    stopTimer()
    timer = setInterval(() => {
      // Stays on the last step; only the response moves the state to ready.
      if (stepIndex.value < BUILD_STEPS.length - 1) stepIndex.value += 1
    }, STEP_INTERVAL_MS)
  }

  function usesOwnKey(): boolean {
    return loadSettings(browserStorage).apiKey.trim() !== ''
  }

  function showError(code: ErrorCode): void {
    errorCode.value = code
    errorMessage.value = friendlyMessage(code, { usesOwnKey: usesOwnKey() })
    state.value = 'error'
  }

  /** The token as held right now, read once per request; null shows the session error (Req 3.2). */
  async function readToken(): Promise<string | null> {
    preparing = true
    const token = await auth.accessToken().finally(() => {
      preparing = false
    })
    if (token === null) showError('unauthorized')
    return token
  }

  /** The Settings language: the account value wins, else the browser copy. */
  function learnerLanguage(): string {
    const account = cloud.profile.value?.language ?? null
    if (account !== null && account.trim() !== '') return account
    return effectiveLanguage(loadUserSettings(browserStorage))
  }

  /**
   * "Build my path" in the input state, and the landing handoff (Req 1.6, 3.1). Runs intake and
   * opens the Panel; any Intake_Failure builds at once from the hobby alone (Req 3.6, decision 11).
   */
  async function start(): Promise<void> {
    const value = hobby.value.trim()
    if (value.length === 0 || state.value !== 'input' || preparing) return
    // Checked before intake, so no request is spent on a build the limit would stop.
    if (blockedByLimit(value)) {
      state.value = 'limit'
      return
    }
    const token = await readToken()
    if (token === null) return
    if (disposed) return

    state.value = 'reading'
    errorCode.value = null
    errorMessage.value = null
    outfit.value = 'none'
    const current = new AbortController()
    intakeController = current
    const request = buildIntakeRequest(value, note.value, learnerLanguage(), loadSettings(browserStorage))
    const outcome = await runIntake(request, {
      fetch: (body, signal) =>
        $fetch<unknown>('/api/intake', {
          method: 'POST',
          body: body.body,
          headers: { ...body.headers, ...bearerHeader(token) },
          signal,
          retry: 0,
        }),
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      signal: current.signal,
    })
    if (intakeController === current) intakeController = null
    // The learner left the page: start nothing (Req 3.7).
    if (disposed || current.signal.aborted) return

    if (outcome.kind === 'profile') {
      panel.value = openPanel(outcome.profile)
      outfit.value = toWickOutfit(outcome.profile.mascotSet)
      state.value = 'panel'
      track('intake_shown', shownProps(panel.value))
      return
    }
    track('intake_failed')
    await generate(null)
  }

  function removeChip(field: ProfileField): void {
    if (panel.value === null || state.value !== 'panel') return
    panel.value = removePanelChip(panel.value, field)
    track('intake_chip_removed', { field })
  }

  function toggleGoal(id: string): void {
    if (panel.value !== null && state.value === 'panel') panel.value = togglePanelGoal(panel.value, id)
  }

  function toggleKnown(id: string): void {
    if (panel.value !== null && state.value === 'panel') panel.value = toggleOption(panel.value, 'known', id)
  }

  function toggleTaste(id: string): void {
    if (panel.value !== null && state.value === 'panel') panel.value = toggleOption(panel.value, 'taste', id)
  }

  /** "Build my path" in the Panel (Req 6.1). */
  async function buildFromPanel(): Promise<void> {
    const current = panel.value
    if (current === null || state.value !== 'panel' || preparing) return
    track('intake_answered', answeredProps(current))
    await generate(finalProfile(current, 'build'))
  }

  /** "Skip, just build it": the remaining Chips only (Req 6.2). */
  async function skip(): Promise<void> {
    const current = panel.value
    if (current === null || state.value !== 'panel' || preparing) return
    track('intake_skipped')
    await generate(finalProfile(current, 'skip'))
  }

  /**
   * "Try again" in the error state (Req 13.2, 13.3): the same hobby builds again with the same
   * profile and no intake; a changed hobby goes back to the input state and sends nothing.
   */
  async function retry(): Promise<void> {
    if (state.value !== 'error' || preparing) return
    const value = hobby.value.trim()
    if (value.length === 0) return
    if (lastBuild !== null && normalizeHobby(value) === lastBuild.hobby) {
      await generate(lastBuild.profile)
      return
    }
    lastBuild = null
    errorCode.value = null
    errorMessage.value = null
    state.value = 'input'
  }

  /** Builds the path for the hobby and the Final_Profile, or with no profile after an Intake_Failure. */
  async function generate(profile: FinalProfile | null): Promise<void> {
    const value = hobby.value.trim()
    if (value.length === 0 || state.value === 'generating' || preparing) return
    if (blockedByLimit(value)) {
      panel.value = null
      state.value = 'limit'
      return
    }
    // The Settings goal: the account value wins, else the browser copy (spec: skill-video-pipeline, Req 1.11).
    const accountGoal = cloud.profile.value?.goal ?? null
    const goal = accountGoal !== null && accountGoal.trim() !== '' ? accountGoal : loadUserSettings(browserStorage).goal
    const request = buildTreeRequest(value, profile, loadSettings(browserStorage), goal)
    const requestLevel = startLevelFor(profile?.level ?? null)
    lastBuild = { hobby: normalizeHobby(value), profile }
    // The token as held right now; without one nothing is sent (spec: accounts-cloud-save, Req 9.12, 9.14).
    const token = await readToken()
    if (token === null) return
    if (disposed) return
    panel.value = null
    state.value = 'generating'
    stepIndex.value = 0
    summary.value = null
    errorCode.value = null
    errorMessage.value = null
    hobbyId = null
    startTimer()

    const current = new AbortController()
    controller = current
    const abortTimer = setTimeout(() => current.abort(), TIMEOUT_MS)
    let code: ErrorCode
    try {
      const response = await $fetch<unknown>('/api/tree', {
        method: 'POST',
        body: request.body,
        headers: { ...request.headers, ...bearerHeader(token) },
        signal: current.signal,
        retry: 0,
      })
      const record = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {}
      const loaded = loadSkillTree(record.tree)
      const model = record.model
      const pathId = record.pathId
      if (loaded.ok && typeof model === 'string' && model.length > 0 && typeof pathId === 'string' && pathId !== '') {
        // The route already saved it to the account; nothing is written to localStorage (spec: accounts-cloud-save, Req 5.8).
        // The tree and its Stored_Profile are held together, as every store keeps them (spec: path-intake).
        const saved = readTreeWithProfile(loaded.value, record.profile)
        hobbyId = cloud.addGenerated({ pathId, tree: saved.tree, model, level: requestLevel, profile: saved.profile })
        summary.value = summarizeTree(saved.tree, saved.profile)
        outfit.value = toWickOutfit(saved.tree.mascot.set)
        posthog?.capture('skill_path_generated', { start_level: requestLevel })
        stopTimer()
        state.value = 'ready'
        return
      }
      code = errorCodeFrom(response)
    } catch (e) {
      code = current.signal.aborted ? 'timeout' : errorCodeFrom(errorData(e))
    } finally {
      clearTimeout(abortTimer)
      if (controller === current) controller = null
    }
    stopTimer()
    // The server's limit answer is the limit card, not an error.
    if (code === 'hobby_limit') {
      state.value = 'limit'
      return
    }
    // Keep the typed hobby, the Note and the profile so the learner can retry (Req 8.4, 13.1).
    showError(code)
  }

  /** Editing the hobby or the Note closes the Panel and drops its answers (Req 4.9). */
  function closePanel(): void {
    if (panel.value === null) return
    panel.value = null
    outfit.value = 'none'
    if (state.value === 'panel') state.value = 'input'
  }
  watch([hobby, note], closePanel)

  function pickIdea(idea: string): void {
    if (state.value === 'generating' || state.value === 'reading') return
    hobby.value = idea
    errorCode.value = null
    errorMessage.value = null
    state.value = 'input'
    closePanel()
  }

  function surprise(): void {
    if (state.value === 'generating' || state.value === 'reading') return
    const index = Math.floor(Math.random() * SURPRISE_POOL.length)
    pickIdea(SURPRISE_POOL[index] ?? SURPRISE_POOL[0])
  }

  async function openPath(): Promise<void> {
    if (hobbyId === null) return
    await navigateTo(hobbyPath(hobbyId))
  }

  onScopeDispose(() => {
    disposed = true
    stopTimer()
    controller?.abort()
    controller = null
    intakeController?.abort()
    intakeController = null
  })

  return {
    hobby,
    note,
    state: readonly(state),
    /** Read only for callers: every change goes through the actions below. */
    panel: computed(() => panel.value),
    stepIndex: readonly(stepIndex),
    errorCode: readonly(errorCode),
    errorMessage: readonly(errorMessage),
    summary: readonly(summary),
    outfit: readonly(outfit),
    limitReached,
    activeHobbyCount,
    start,
    removeChip,
    toggleGoal,
    toggleKnown,
    toggleTaste,
    buildFromPanel,
    skip,
    retry,
    pickIdea,
    surprise,
    openPath,
  }
}
