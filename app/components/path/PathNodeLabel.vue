<script setup lang="ts">
import { computed } from 'vue'
import type { NodeState } from '#shared/types/progress'
import { nodeVisual } from '~/utils/node-visual'

/**
 * Title and status line beside a Main_Node or below a Side_Quest_Node
 * (Req 6.11, 6.12). Hidden from assistive technology: the node button
 * already carries the same text as its accessible name.
 */
const props = defineProps<{
  title: string
  status: string
  state: NodeState
  align: 'side' | 'below'
  maxWidth: number
}>()

const visual = computed(() => nodeVisual(props.state, false))
</script>

<template>
  <div
    aria-hidden="true"
    class="flex flex-col gap-0.5 break-words"
    :class="align === 'below' ? 'items-center text-center' : 'items-start text-left'"
    :style="{ width: `${maxWidth}px` }"
  >
    <span class="text-[15px] leading-[1.2] font-extrabold lg:text-base" :class="visual.titleClass">{{ title }}</span>
    <span class="text-xs font-bold lg:text-[13px]" :class="visual.statusClass">{{ status }}</span>
  </div>
</template>
