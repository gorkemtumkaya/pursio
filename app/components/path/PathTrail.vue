<script setup lang="ts">
import { computed } from 'vue'
import type { NodeState } from '#shared/types/progress'
import { segmentTone } from '~/utils/node-visual'
import type { TrailSegment } from '~/utils/path-layout'

/**
 * Trail dots between linked nodes (Req 6.1–6.3). The nested `<svg x="50%">`
 * puts x = 0 on the center line, so dot `cx` values are layout offsets.
 */
const props = defineProps<{
  segments: readonly TrailSegment[]
  states: ReadonlyMap<string, NodeState>
  dotDiameter: number
}>()

const groups = computed(() =>
  props.segments.map(segment => ({
    key: `${segment.fromId}->${segment.toId}`,
    toneClass: segmentTone(props.states, segment) === 'done' ? 'text-done' : 'text-trail',
    dots: segment.dots,
  })),
)
</script>

<template>
  <svg aria-hidden="true" focusable="false" class="pointer-events-none absolute inset-0 h-full w-full">
    <svg x="50%" overflow="visible">
      <g v-for="group in groups" :key="group.key" :class="group.toneClass">
        <circle
          v-for="(dot, index) in group.dots"
          :key="index"
          :cx="dot.x"
          :cy="dot.y"
          :r="dotDiameter / 2"
          fill="currentColor"
        />
      </g>
    </svg>
  </svg>
</template>
