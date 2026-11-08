import { onScopeDispose, readonly, ref } from 'vue'
import type { ErrorCode, StartLevel } from '#shared/types/llm'
import { loadSkillTree } from '#shared/utils/skill-tree-load'
import { DEFAULT_LEVEL } from '#shared/utils/llm'
import { toWickOutfit, type WickOutfit } from '~/components/mascot/wick'
import { addHobby, hobbyPath } from '~/utils/hobby-store'
import { loadSettings } from '~/utils/llm-settings'
import type { StorageLike } from '~/utils/progress-store'
import { buildTreeRequest, errorCodeFrom, friendlyMessage } from '~/utils/tree-client'
import { summarizeTree, type TreeSummary } from '~/utils/tree-summary'

export type BuilderState = 'input' | 'generating' | 'ready' | 'error'

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

/** State and actions of the new hobby page (spec: new-hobby-page). */
export function useHobbyBuilder() {
  const hobby = ref('')
  const level = ref<StartLevel>(DEFAULT_LEVEL)
  const state = ref<BuilderState>('input')
  const stepIndex = ref(0)
  const errorCode = ref<ErrorCode | null>(null)
  const errorMessage = ref<string | null>(null)
  const summary = ref<TreeSummary | null>(null)
  const outfit = ref<WickOutfit>('none')

  let hobbyId: string | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let controller: AbortController | null = null

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

  async function build(): Promise<void> {
    const value = hobby.value.trim()
    if (value.length === 0 || state.value === 'generating') return
    const request = buildTreeRequest(value, level.value, loadSettings(browserStorage))
    state.value = 'generating'
    stepIndex.value = 0
    outfit.value = 'none'
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
        headers: request.headers,
        signal: current.signal,
        retry: 0,
      })
      const record = typeof response === 'object' && response !== null ? (response as Record<string, unknown>) : {}
      const loaded = loadSkillTree(record.tree)
      const model = record.model
      if (loaded.ok && typeof model === 'string' && model.length > 0) {
        // Kept in the Hobby_Library next to earlier hobbies (spec: local-progress-data, Req 3.1).
        hobbyId = addHobby(browserStorage, { tree: loaded.value, model })
        summary.value = summarizeTree(loaded.value)
        outfit.value = toWickOutfit(loaded.value.mascot.set)
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
    // Keep the typed hobby so the learner can retry (Req 8.4).
    stopTimer()
    errorCode.value = code
    errorMessage.value = friendlyMessage(code, { usesOwnKey: request.usesOwnKey })
    state.value = 'error'
  }

  function pickIdea(idea: string): void {
    if (state.value === 'generating') return
    hobby.value = idea
    errorCode.value = null
    errorMessage.value = null
    state.value = 'input'
  }

  function surprise(): void {
    if (state.value === 'generating') return
    const index = Math.floor(Math.random() * SURPRISE_POOL.length)
    pickIdea(SURPRISE_POOL[index] ?? SURPRISE_POOL[0])
  }

  async function openPath(): Promise<void> {
    if (hobbyId === null) return
    await navigateTo(hobbyPath(hobbyId))
  }

  onScopeDispose(() => {
    stopTimer()
    controller?.abort()
    controller = null
  })

  return {
    hobby,
    level,
    state: readonly(state),
    stepIndex: readonly(stepIndex),
    errorCode: readonly(errorCode),
    errorMessage: readonly(errorMessage),
    summary: readonly(summary),
    outfit: readonly(outfit),
    build,
    pickIdea,
    surprise,
    openPath,
  }
}
