<script setup lang="ts">
import { computed } from 'vue'
import { ICONS, type IconName } from '~/utils/icons'

const props = defineProps<{ name: IconName }>()

const icon = computed(() => ICONS[props.name])
</script>

<template>
  <svg
    aria-hidden="true"
    focusable="false"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    :fill="icon.filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-for="(shape, index) in icon.shapes" :key="index">
      <path v-if="shape.tag === 'path'" :d="shape.d" />
      <rect
        v-else-if="shape.tag === 'rect'"
        :x="shape.x"
        :y="shape.y"
        :width="shape.width"
        :height="shape.height"
        :rx="shape.rx"
      />
      <circle v-else :cx="shape.cx" :cy="shape.cy" :r="shape.r" />
    </template>
  </svg>
</template>
