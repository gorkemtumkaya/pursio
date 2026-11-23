<script setup lang="ts">
import MascotWick from '~/components/mascot/wick.vue'
import { LANDING_COPY, PREVIEW_NODES } from '~/utils/landing-copy'

/**
 * Path preview of the hero (design: dev_docs "Landing page"): a static picture
 * of a path card with four nodes, the trail dots, a speech bubble and Wick.
 * Decorative, so the whole card is aria-hidden and holds nothing focusable.
 * It must read as a sample, not as the visitor's path or a control: an "Example path"
 * label sits above it, and the card is flat with a dashed border (no raised shadow).
 * Positions are the design's: nodes of 64 px, 98 px apart, offset from the center.
 */
const SIZE = 64
const TOP = 112
const ROW = 98
const RING = 8

const { theme } = useTheme()

const NODE_CLASS = {
  done: 'bg-done text-done-ink shadow-raised-done',
  current: 'bg-primary text-primary-ink shadow-raised-primary',
  locked: 'bg-locked text-locked-ink shadow-raised-locked',
} as const
const ICON = { done: 'check', current: 'star', locked: 'lock' } as const

const nodes = PREVIEW_NODES.map((node, index) => {
  const y = TOP + index * ROW
  return {
    ...node,
    icon: ICON[node.state],
    nodeClass: NODE_CLASS[node.state],
    nodeStyle: { left: `calc(50% + ${node.dx - SIZE / 2}px)`, top: `${y}px`, width: `${SIZE}px`, height: `${SIZE}px` },
    ringStyle: {
      left: `calc(50% + ${node.dx - SIZE / 2 - RING}px)`,
      top: `${y - RING}px`,
      width: `${SIZE + RING * 2}px`,
      height: `${SIZE + RING * 2}px`,
      background: 'conic-gradient(var(--pursio-primary) 0deg 120deg, var(--pursio-line) 120deg 360deg)',
    },
    labelStyle: { left: `calc(50% + ${node.dx + SIZE / 2 + 12}px)`, top: `${y + SIZE / 2 - 18}px` },
  }
})

/** Three dots between each pair of nodes; green up to the current node. */
const dots = PREVIEW_NODES.slice(0, -1).flatMap((from, index) => {
  const to = PREVIEW_NODES[index + 1]!
  const fromY = TOP + index * ROW + SIZE / 2
  return [0.3, 0.5, 0.7].map((f) => ({
    key: `${index}-${f}`,
    done: index < 2,
    style: { left: `calc(50% + ${from.dx + (to.dx - from.dx) * f - 4}px)`, top: `${fromY + ROW * f - 4}px` },
  }))
})
</script>

<template>
  <div aria-hidden="true" class="pointer-events-none flex w-full max-w-[400px] flex-col items-center gap-2.5 select-none">
  <span class="rounded-[10px] bg-surface-2 px-3 py-1.5 text-xs font-extrabold tracking-[0.08em] text-muted">
    {{ LANDING_COPY.previewLabel }}
  </span>
  <div
    class="relative h-[520px] w-full overflow-hidden rounded-4xl border-2 border-dashed border-locked-deep bg-surface"
  >
    <div
      class="m-4 flex items-center justify-between rounded-[18px] bg-banner px-4 py-3 text-banner-ink shadow-[0_4px_0_var(--pursio-banner-deep)]"
    >
      <span class="flex flex-col gap-0.5">
        <span class="text-[11px] font-extrabold tracking-[0.08em] text-banner-muted">
          {{ LANDING_COPY.previewEyebrow }}
        </span>
        <span class="font-head text-lg leading-tight font-semibold">{{ LANDING_COPY.previewSection }}</span>
      </span>
      <span class="font-head text-[15px] font-semibold">{{ LANDING_COPY.previewCount }}</span>
    </div>

    <span
      v-for="dot in dots"
      :key="dot.key"
      class="absolute size-2 rounded-full"
      :class="dot.done ? 'bg-done' : 'bg-trail'"
      :style="dot.style"
    />

    <template v-for="node in nodes" :key="node.title">
      <span v-if="node.state === 'current'" class="absolute rounded-node" :style="node.ringStyle" />
      <span class="absolute flex items-center justify-center rounded-node" :class="node.nodeClass" :style="node.nodeStyle">
        <PathIcon :name="node.icon" :class="node.state === 'locked' ? 'size-[22px]' : 'size-7'" />
      </span>
      <span class="absolute flex w-[130px] flex-col gap-px" :style="node.labelStyle">
        <span
          class="text-sm leading-[1.2] font-extrabold"
          :class="node.state === 'locked' ? 'text-muted' : 'text-ink'"
        >
          {{ node.title }}
        </span>
        <span class="text-xs font-bold" :class="node.state === 'current' ? 'text-accent-text' : 'text-muted'">
          {{ node.sub }}
        </span>
      </span>
    </template>

    <div class="absolute right-1.5 bottom-0 flex flex-col items-end">
      <span
        class="mr-5 rounded-[14px_14px_4px_14px] bg-ink px-3 py-2 text-[13px] font-extrabold text-bg"
      >
        {{ LANDING_COPY.previewBubble }}
      </span>
      <span class="max-[699px]:hidden"><MascotWick outfit="bouldering" :theme="theme" :size="130" /></span>
      <span class="min-[700px]:hidden"><MascotWick outfit="bouldering" :theme="theme" :size="110" /></span>
    </div>
  </div>
  </div>
</template>
