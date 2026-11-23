<script setup lang="ts">
import { computed } from 'vue'
import type { NodeState } from '#shared/types/progress'
import { nodeVisual } from '~/utils/node-visual'

/**
 * Title and status line beside a Main_Node or below a Side_Quest_Node
 * (Req 6.11, 6.12). Hidden from assistive technology: the node button
 * already carries the same text as its accessible name.
 *
 * The title is clamped (two lines below a side quest, three beside a main
 * node) because the layout reserves a fixed height for the label:
 * `sideLabelReserve` and `mainLabelReach` in `path-layout.ts`.
 */
const props = defineProps<{
  title: string
  status: string
  state: NodeState
  align: 'side' | 'below'
  maxWidth: number
  /** Lines of a title beside a main node (Preview_Mode, spec: sample-path). Default 3. */
  sideLines?: 3 | 4 | 5
}>()

const visual = computed(() => nodeVisual(props.state, false))

/** Static class names, so Tailwind finds each one. */
const SIDE_CLAMP = { 3: 'line-clamp-3', 4: 'line-clamp-4', 5: 'line-clamp-5' } as const
</script>

<template>
  <div
    aria-hidden="true"
    class="flex flex-col gap-0.5 break-words"
    :class="align === 'below' ? 'items-center text-center' : 'items-start text-left'"
    :style="{ width: `${maxWidth}px` }"
  >
    <span
      class="text-[15px] leading-[1.2] font-extrabold lg:text-base"
      :class="[visual.titleClass, align === 'below' ? 'line-clamp-2' : SIDE_CLAMP[sideLines ?? 3]]"
    >{{ title }}</span>
    <span class="text-xs font-bold lg:text-[13px]" :class="visual.statusClass">{{ status }}</span>
  </div>
</template>
