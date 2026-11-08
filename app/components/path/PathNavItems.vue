<script setup lang="ts">
import { computed } from 'vue'

/**
 * Main navigation (Req 12.7). Only "Path" exists for now; Fresh, Quests and
 * Profile stay hidden until those features ship (spec: local-progress-data, Req 5.1).
 */
const props = defineProps<{ variant: 'bottom' | 'side' }>()

const isSide = computed(() => props.variant === 'side')

const itemClass = computed(() =>
  isSide.value
    ? 'flex h-12 w-full items-center gap-3 rounded-2xl px-3.5 text-[15px]'
    : 'flex h-full min-h-11 w-full min-w-11 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs',
)
const iconClass = computed(() => (isSide.value ? 'size-5.5 shrink-0' : 'size-6 shrink-0'))
</script>

<template>
  <ul :class="isSide ? 'flex flex-col gap-1.5' : 'flex h-full justify-center'">
    <li :class="isSide ? '' : 'w-28'">
      <NuxtLink
        to="/path"
        aria-current="page"
        :class="itemClass"
        class="bg-primary-soft font-extrabold text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <PathIcon name="map" :class="iconClass" />
        <span>Path</span>
      </NuxtLink>
    </li>
  </ul>
</template>
