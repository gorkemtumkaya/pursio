<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { NodeState, Progress } from '#shared/types/progress'
import type { SkillNode, SkillTree } from '#shared/types/skill-tree'
import { checkedCount } from '#shared/utils/progress-engine'
import { nodeVisual, statusLine } from '~/utils/node-visual'
import type { NodePlacement, PathLayout } from '~/utils/path-layout'
import { sectionHeaderModels } from '~/utils/section-headers'

/**
 * The drawn path: trail dots, Section_Headers, nodes, labels, the
 * Progress_Ring and the NEXT UP tag. Children are placed with
 * `left: calc(50% + Xpx)` / `top: Ypx`, so x = 0 is the center line.
 */
const props = defineProps<{
  tree: SkillTree
  layout: PathLayout
  states: ReadonlyMap<string, NodeState>
  progress: Progress
  /** Active_Section index. The header models derive the same value from `progress`. */
  activeSection: number
  selectedId: string | null
  /** Desktop only: draw the selection outline (Req 8.15). */
  showSelection: boolean
  /** Ids that play the unlock animation (Req 9.5). */
  animating: ReadonlySet<string>
}>()

const emit = defineEmits<{ select: [id: string, el: HTMLButtonElement] }>()

/** Reference-design label and tag metrics per viewport class (px). */
const METRICS = {
  mobile: { mainGap: 14, sideGap: 10, mainWidth: 104, sideWidth: 100, tagLift: 44 },
  desktop: { mainGap: 16, sideGap: 12, mainWidth: 150, sideWidth: 140, tagLift: 50 },
} as const

/** Labels never shrink below this, even on a very narrow column. */
const MIN_LABEL_WIDTH = 48

const root = ref<HTMLElement | null>(null)
/** Half the canvas width, measured on the client; null until mounted. */
const halfColumn = ref<number | null>(null)
let observer: ResizeObserver | null = null

onMounted(() => {
  const el = root.value
  if (!el) return
  halfColumn.value = el.getBoundingClientRect().width / 2
  if (typeof ResizeObserver === 'undefined') return
  observer = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry) halfColumn.value = entry.contentRect.width / 2
  })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

const metrics = computed(() => METRICS[props.layout.viewport])

function px(n: number): string {
  return `${Math.round(n * 100) / 100}px`
}

function at(x: number, y: number): Record<string, string> {
  return { left: `calc(50% + ${px(x)})`, top: px(y) }
}

/** Fit a label width into the column (design "label max widths"). */
function fit(reference: number, available: number | null): number {
  if (available === null) return reference
  return Math.max(MIN_LABEL_WIDTH, Math.min(reference, Math.floor(available)))
}

interface NodeView {
  node: SkillNode
  placement: NodePlacement
  state: NodeState
  checked: number
  status: string
  ring: boolean
  nextUp: boolean
  nodeStyle: Record<string, string>
  label: { align: 'side' | 'below'; style: Record<string, string>; maxWidth: number }
}

const nodeViews = computed<NodeView[]>(() => {
  const m = metrics.value
  const half = halfColumn.value
  const seen = new Set<string>()
  const views: NodeView[] = []
  for (const section of props.tree.sections) {
    for (const node of section.nodes) {
      const placement = props.layout.nodes[node.id]
      if (!placement || seen.has(node.id)) continue
      seen.add(node.id)
      const state = props.states.get(node.id) ?? 'locked'
      const checked = checkedCount(props.progress, node.id)
      const visual = nodeVisual(state, node.milestone)
      const { cx, cy, size } = placement
      const top = cy - size / 2

      let label: NodeView['label']
      if (placement.kind === 'side') {
        const available = half === null ? null : 2 * (half - Math.abs(cx)) - 4
        label = { align: 'below', style: at(cx, top + size + m.sideGap), maxWidth: fit(m.sideWidth, available) }
      }
      else {
        const start = cx + size / 2 + m.mainGap
        const available = half === null ? null : half - start - 4
        label = { align: 'side', style: at(start, cy), maxWidth: fit(m.mainWidth, available) }
      }

      views.push({
        node,
        placement,
        state,
        checked,
        status: statusLine(state, checked),
        ring: visual.ring,
        nextUp: visual.nextUp,
        nodeStyle: at(cx - size / 2, top),
        label,
      })
    }
  }
  return views
})

const ringViews = computed(() =>
  nodeViews.value
    .filter(view => view.ring)
    .map((view) => {
      const { cx, cy, size } = view.placement
      const pad = props.layout.ringPad
      return { id: view.node.id, size, pad, checked: view.checked, style: at(cx - size / 2 - pad, cy - size / 2 - pad) }
    }),
)

const tagView = computed(() => {
  const view = nodeViews.value.find(v => v.nextUp)
  if (!view) return null
  const { cx, cy, size } = view.placement
  return { style: at(cx, cy - size / 2 - metrics.value.tagLift) }
})

const headerViews = computed(() => {
  const models = sectionHeaderModels(props.tree, props.progress)
  return props.layout.headers.flatMap((placement) => {
    const model = models[placement.sectionIndex]
    return model ? [{ model, placement }] : []
  })
})

function onSelect(id: string, el: HTMLButtonElement): void {
  emit('select', id, el)
}

/** Move keyboard focus to a node button, e.g. when the Bottom_Sheet closes (Req 8.16). */
function focusNode(id: string): void {
  const el = root.value?.querySelector<HTMLButtonElement>(`button[data-node-id="${CSS.escape(id)}"]`)
  el?.focus()
}

defineExpose({ focusNode })
</script>

<template>
  <div ref="root" class="relative w-full overflow-x-clip" :style="{ height: px(layout.height) }">
    <PathTrail :segments="layout.segments" :states="states" :dot-diameter="layout.dotDiameter" />

    <PathSectionHeader
      v-for="header in headerViews"
      :key="header.model.index"
      class="absolute inset-x-4 lg:inset-x-0"
      :style="{ top: px(header.placement.top) }"
      :eyebrow="header.model.eyebrow"
      :title="header.model.title"
      :variant="header.model.variant"
      :count="header.model.count"
      :locked-by="header.model.lockedBy"
      :height="header.placement.height"
    />

    <PathProgressRing
      v-for="ring in ringViews"
      :key="`ring-${ring.id}`"
      class="absolute"
      :style="ring.style"
      :size="ring.size"
      :pad="ring.pad"
      :checked="ring.checked"
    />

    <PathNode
      v-for="view in nodeViews"
      :key="view.node.id"
      class="absolute"
      :style="view.nodeStyle"
      :node="view.node"
      :state="view.state"
      :is-milestone="view.node.milestone"
      :size="view.placement.size"
      :checked="view.checked"
      :selected="showSelection && selectedId === view.node.id"
      :animate="animating.has(view.node.id)"
      @select="onSelect(view.node.id, $event)"
    />

    <PathNodeLabel
      v-for="view in nodeViews"
      :key="`label-${view.node.id}`"
      class="pointer-events-none absolute"
      :class="view.label.align === 'below' ? '-translate-x-1/2' : '-translate-y-1/2'"
      :style="view.label.style"
      :title="view.node.title"
      :status="view.status"
      :state="view.state"
      :align="view.label.align"
      :max-width="view.label.maxWidth"
    />

    <PathNextUpTag v-if="tagView" class="absolute -translate-x-1/2" :style="tagView.style" />
  </div>
</template>
