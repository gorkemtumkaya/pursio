import type { ComputedRef, Ref } from 'vue'
import type { CompletionResult, NodeState, Progress } from '#shared/types/progress'
import type { SkillTree } from '#shared/types/skill-tree'
import {
  activeSectionIndex,
  deriveNodeStates,
  diffUnlocked,
  emptyProgress,
  findCurrentNodeId,
  markComplete,
  toggleQuest as toggleQuestPure,
} from '#shared/utils/progress-engine'
import { xpSummary, type XpSummary } from '#shared/utils/xp'
import type { ProgressStore } from '~/utils/progress-store'

/** A successful completion plus the ids it unlocked (Req 9.5). */
export interface CompletionOutcome {
  result: Extract<CompletionResult, { completed: true }>
  unlocked: string[]
}

export interface SkillPath {
  progress: Readonly<Ref<Progress>>
  states: ComputedRef<Map<string, NodeState>>
  currentId: ComputedRef<string | null>
  activeSection: ComputedRef<number>
  xp: ComputedRef<XpSummary>
  toggleQuest(id: string, index: 0 | 1 | 2): void
  complete(id: string): CompletionOutcome | null
}

/**
 * Reactive Progress for one tree. Starts empty on server and client so hydration
 * matches, then loads saved Progress after mount (Req 10.2, 10.3). Every action
 * saves in the same tick (Req 10.1, 10.8). The caller chooses where Progress
 * lives: the Cloud_Store's store for an account path, or a localStorage store in
 * Demo_Mode (spec: accounts-cloud-save, Req 6.1, 12.2).
 */
export function useSkillPath(tree: SkillTree, store: ProgressStore): SkillPath {
  const progress = shallowRef<Progress>(emptyProgress())

  onMounted(() => {
    progress.value = store.load()
  })

  const states = computed(() => deriveNodeStates(tree, progress.value))
  const currentId = computed(() => findCurrentNodeId(tree, progress.value))
  const activeSection = computed(() => activeSectionIndex(tree, progress.value))
  const xp = computed(() => xpSummary(tree, progress.value))

  function commit(next: Progress): void {
    progress.value = next
    store.save(next)
  }

  function toggleQuest(id: string, index: 0 | 1 | 2): void {
    const next = toggleQuestPure(tree, progress.value, id, index)
    if (next !== progress.value) commit(next)
  }

  function complete(id: string): CompletionOutcome | null {
    const before = states.value
    const result = markComplete(tree, progress.value, id)
    if (!result.completed) return null
    commit(result.progress)
    return { result, unlocked: diffUnlocked(before, states.value) }
  }

  return {
    progress: shallowReadonly(progress),
    states,
    currentId,
    activeSection,
    xp,
    toggleQuest,
    complete,
  }
}
