<script setup lang="ts">
import { computed } from 'vue'
import { ringDegrees } from '~/utils/node-visual'

/**
 * Progress_Ring behind the Current_Node (Req 6.5, 6.6): a `rounded-node`
 * square `pad` px larger than the node on every side, filled `checked * 120deg`.
 */
const props = defineProps<{ size: number; pad: number; checked: number }>()

const style = computed(() => {
  const side = props.size + props.pad * 2
  return { width: `${side}px`, height: `${side}px`, '--ring-deg': `${ringDegrees(props.checked)}deg` }
})
</script>

<template>
  <span aria-hidden="true" class="progress-ring rounded-node" :style="style" />
</template>

<style scoped>
.progress-ring {
  background: conic-gradient(var(--pursio-primary) 0 var(--ring-deg), var(--pursio-line) 0);
}
</style>
