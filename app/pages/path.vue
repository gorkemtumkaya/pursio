<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useTemplateRef } from 'vue'
import type { QuestTriple, SkillNode, SkillTree } from '#shared/types/skill-tree'
import { formatValidationError, loadSkillTree } from '#shared/utils/skill-tree-load'
import { STATIC_STREAK } from '#shared/utils/xp'
import sample from '~~/data/sample-bouldering.json'
import { usePathLayout } from '~/composables/usePathLayout'
import { useSkillPath } from '~/composables/useSkillPath'
import { useViewportClass } from '~/composables/useViewportClass'
import { freshFor } from '~/utils/fresh-samples'
import { detailTitleId } from '~/utils/node-visual'

/**
 * Path_View orchestration (design "Page orchestration"). Loading the tree is
 * pure, so server and client agree on the result. Progress, viewport and
 * layout only change after mount, so SSR and the first client render show
 * the loading state (Req 5.11, 10.8).
 */

useHead({ title: 'Your path · Pursio' })

const loaded = loadSkillTree(sample)

/** First Validation_Error as text, or null when the Sample_Tree is valid (Req 3.8). */
const loadError = loaded.ok ? null : formatValidationError(loaded.errors[0]!)

/**
 * Stand-in when loading fails, so the composables below can run
 * unconditionally. Nothing renders from it and layout never starts for it.
 */
const EMPTY_TREE: SkillTree = { hobby: '', sections: [], mascot: { set: 'explorer' } }
const tree: SkillTree = loaded.ok ? loaded.value : EMPTY_TREE

const { progress, states, currentId, activeSection, xp, toggleQuest, complete } = useSkillPath(tree)
const viewport = useViewportClass()
/** Held at null after a load failure so the Path_Layout never runs (Req 3.8). */
const layoutViewport = computed(() => (loadError === null ? viewport.value : null))
const { status, layout } = usePathLayout(tree, layoutViewport)

interface NodeEntry {
  node: SkillNode
  /** 1-based Section index and 1-based index within the Section (Req 8.5). */
  position: { section: number; skill: number }
}

const nodeIndex = new Map<string, NodeEntry>()
tree.sections.forEach((section, s) => {
  section.nodes.forEach((node, n) => {
    nodeIndex.set(node.id, { node, position: { section: s + 1, skill: n + 1 } })
  })
})
const totalNodes = nodeIndex.size
const lastNodeId = tree.sections.at(-1)?.nodes.at(-1)?.id ?? null

// Selection state. All of it lives here, so a viewport switch keeps it (Req 12.10).
/** Last tapped or clicked node; null means "use the default". */
const selectedId = ref<string | null>(null)
/** Mobile Bottom_Sheet open. */
const sheetOpen = ref(false)
/** Node whose button opened the Bottom_Sheet, for focus return (Req 8.16). */
const openerId = ref<string | null>(null)
/** Node ids playing the unlock animation (Req 9.5). Filled by the completion flow. */
const animating = shallowRef<ReadonlySet<string>>(new Set())

/** Selected node, else the Current_Node, else the last node of the last Section (Req 8.2). */
const effectiveSelectedId = computed(() => selectedId.value ?? currentId.value ?? lastNodeId)

const UNCHECKED: QuestTriple<boolean> = [false, false, false]

const detail = computed(() => {
  const id = effectiveSelectedId.value
  const entry = id === null ? undefined : nodeIndex.get(id)
  if (!entry) return null
  const { node, position } = entry
  const stateMap = states.value
  return {
    node,
    position,
    state: stateMap.get(node.id) ?? 'locked',
    isCurrent: currentId.value === node.id,
    checks: progress.value.quests[node.id] ?? UNCHECKED,
    lockedBy: node.prerequisites
      .filter(p => stateMap.get(p) !== 'completed')
      .map(p => nodeIndex.get(p)?.node.title ?? p),
    fresh: freshFor(node.id),
  }
})

/** Share of all nodes completed, for the sidebar hobby card. */
const percentComplete = computed(() =>
  totalNodes === 0 ? 0 : Math.round((progress.value.completed.length / totalNodes) * 100),
)

interface CanvasHandle {
  focusNode(id: string): void
}
const canvas = useTemplateRef<CanvasHandle>('canvas')

/** Tap opens the Bottom_Sheet on mobile (Req 8.1); click selects on desktop (Req 8.3). */
function onSelect(id: string): void {
  selectedId.value = id
  if (viewport.value === 'mobile') {
    openerId.value = id
    sheetOpen.value = true
  }
}

/** Close keeps every quest check, which already lives in Progress (Req 8.13), and refocuses the opener (Req 8.16). */
function closeSheet(): void {
  sheetOpen.value = false
  const opener = openerId.value
  if (opener === null) return
  void nextTick(() => canvas.value?.focusNode(opener))
}

function onToggle(id: string, index: number): void {
  if (index === 0 || index === 1 || index === 2) toggleQuest(id, index)
}

/** Unlock animation length (Req 9.5). */
const UNLOCK_ANIMATION_MS = 600

/** Unlock_Moment card open (Req 9.3, 9.4). */
const unlockOpen = ref(false)
/** Last card content. Kept after Continue so the leave transition shows no blank title. */
const unlock = ref<{ completedId: string; completedTitle: string; nextTitle: string | null } | null>(null)

let animationTimer: ReturnType<typeof setTimeout> | null = null

function clearAnimationTimer(): void {
  if (animationTimer !== null) {
    clearTimeout(animationTimer)
    animationTimer = null
  }
}

onBeforeUnmount(clearAnimationTimer)

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Completion flow (design "Page orchestration"). Node states, Section_Headers
 * and Header_Stats are computed from Progress, so they update in the same
 * render as `complete`; the animation is decorative (Req 7.6, 7.7, 9.6, 11.5).
 * A disabled "Mark complete" has no handler bound (Req 9.2).
 */
function onComplete(id: string): void {
  const outcome = complete(id)
  if (outcome === null) return

  clearAnimationTimer()
  if (prefersReducedMotion() || outcome.unlocked.length === 0) {
    animating.value = new Set()
  } else {
    animating.value = new Set(outcome.unlocked)
    animationTimer = setTimeout(() => {
      animationTimer = null
      animating.value = new Set()
    }, UNLOCK_ANIMATION_MS)
  }

  if (outcome.result.kind === 'main') {
    const next = outcome.result.nextCurrentId
    unlock.value = {
      completedId: id,
      completedTitle: nodeIndex.get(id)?.node.title ?? id,
      nextTitle: next === null ? null : (nodeIndex.get(next)?.node.title ?? next),
    }
    unlockOpen.value = true
    return
  }

  // Side quest: no card (Req 9.9).
  selectedId.value = id
  if (viewport.value === 'mobile') {
    openerId.value = id
    closeSheet()
  }
}

/** Continue on the Unlock_Moment card (Req 9.7, 9.8). */
function onContinue(): void {
  const card = unlock.value
  unlockOpen.value = false
  if (viewport.value === 'mobile' && sheetOpen.value) closeSheet()
  const next = currentId.value
  selectedId.value = next ?? card?.completedId ?? selectedId.value
}
</script>

<template>
  <main v-if="loadError !== null" class="mx-auto w-full max-w-160">
    <PathStatus state="error" :message="loadError" />
  </main>

  <template v-else>
    <div class="lg:grid lg:grid-cols-[248px_minmax(0,1fr)_clamp(360px,30vw,460px)]">
      <div class="hidden lg:block">
        <PathSidebar :hobby="tree.hobby" :percent="percentComplete" />
      </div>

      <main class="mx-auto w-full min-w-0 max-w-160">
        <PathMobileHeader class="lg:hidden" :hobby="tree.hobby" :xp="xp" :streak="STATIC_STREAK" />
        <div class="hidden px-6 pt-7 pb-4 lg:block">
          <PathDesktopHeader :hobby="tree.hobby" :xp="xp" :streak="STATIC_STREAK" />
        </div>

        <div class="pt-4 lg:pt-2">
          <PathCanvas
            v-if="status === 'ready' && layout"
            ref="canvas"
            :tree="tree"
            :layout="layout"
            :states="states"
            :progress="progress"
            :active-section="activeSection"
            :selected-id="effectiveSelectedId"
            :show-selection="viewport === 'desktop'"
            :animating="animating"
            @select="onSelect"
          />
          <div v-else class="pb-20 lg:pb-0">
            <PathStatus
              :state="status === 'error' ? 'error' : 'loading'"
              :message="status === 'error' ? 'This path could not be drawn.' : undefined"
            />
          </div>
        </div>
      </main>

      <div class="hidden lg:block">
        <PathSidePanel v-if="viewport !== 'mobile'">
          <PathNodeDetail
            v-if="detail"
            :node="detail.node"
            :state="detail.state"
            :is-current="detail.isCurrent"
            :checks="detail.checks"
            :position="detail.position"
            :locked-by="detail.lockedBy"
            :fresh="detail.fresh"
            layout="panel"
            @toggle="onToggle(detail.node.id, $event)"
            @complete="onComplete(detail.node.id)"
          />
          <PathWeekCard />
        </PathSidePanel>
      </div>
    </div>

    <div class="lg:hidden">
      <PathBottomNav />
    </div>

    <PathBottomSheet
      v-if="viewport === 'mobile'"
      :open="sheetOpen"
      :labelled-by="detailTitleId('sheet')"
      @close="closeSheet"
    >
      <PathNodeDetail
        v-if="detail"
        :node="detail.node"
        :state="detail.state"
        :is-current="detail.isCurrent"
        :checks="detail.checks"
        :locked-by="detail.lockedBy"
        :fresh="detail.fresh"
        layout="sheet"
        @toggle="onToggle(detail.node.id, $event)"
        @complete="onComplete(detail.node.id)"
      />
    </PathBottomSheet>

    <PathUnlockCard
      :open="unlockOpen"
      :completed-title="unlock?.completedTitle ?? ''"
      :next-title="unlock?.nextTitle ?? null"
      @continue="onContinue"
    />
  </template>
</template>
