<script setup lang="ts">
import { computed } from 'vue'
import type { NodeState } from '#shared/types/progress'
import type { SkillNode } from '#shared/types/skill-tree'
import type { IconName } from '~/utils/icons'
import { NODE_SELECTED_CLASS, nodeVisual, statusLine } from '~/utils/node-visual'

/**
 * One skill node as a button (Req 6.4–6.10, 6.13). The parent positions it;
 * `size` comes from the layout, which already uses the milestone size.
 */
const props = defineProps<{
  node: SkillNode
  state: NodeState
  isMilestone: boolean
  size: number
  checked: number
  /** Draw the desktop selection outline (Req 8.15); ignored for `current`. */
  selected: boolean
  /** Play the unlock pop (Req 9.5); `motion-safe` skips it under Reduced_Motion (Req 9.6). */
  animate: boolean
}>()

const emit = defineEmits<{ select: [el: HTMLButtonElement] }>()

/** Icon sizes from the reference design, per icon. */
const ICON_SIZE: Partial<Record<IconName, string>> = {
  check: 'size-8',
  star: 'size-8',
  lock: 'size-6.5',
  trophy: 'size-8.5',
  compass: 'size-7',
}

const visual = computed(() => nodeVisual(props.state, props.isMilestone))
const label = computed(() => `${props.node.title}, ${statusLine(props.state, props.checked)}`)
const iconSize = computed(() => ICON_SIZE[visual.value.icon] ?? 'size-7')
const showOutline = computed(() => props.selected && props.state !== 'current')

function onClick(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLButtonElement) emit('select', event.currentTarget)
}
</script>

<template>
  <button
    type="button"
    :data-node-id="node.id"
    :aria-label="label"
    class="flex cursor-pointer items-center justify-center p-0 focus-visible:outline-4 focus-visible:outline-offset-6 focus-visible:outline-accent-text"
    :class="[
      visual.classes,
      visual.iconClass,
      showOutline ? NODE_SELECTED_CLASS : '',
      animate ? 'motion-safe:animate-[pursio-unlock_450ms_ease-out]' : '',
    ]"
    :style="{ width: `${size}px`, height: `${size}px` }"
    @click="onClick"
  >
    <PathIcon :name="visual.icon" :class="iconSize" />
  </button>
</template>
