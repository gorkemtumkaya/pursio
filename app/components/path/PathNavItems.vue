<script setup lang="ts">
import { computed } from 'vue'

/**
 * Main navigation (Req 12.7). "Path" and "Profile" exist; Fresh and Quests
 * stay hidden until those features ship (spec: local-progress-data, Req 5.1).
 * Demo_Mode has no account, so it shows no Profile item (spec: accounts-cloud-save, Req 11.1, 12.6).
 */
const props = defineProps<{ variant: 'bottom' | 'side' }>()

const route = useRoute()
const isDemo = computed(() => route.query.demo === '1')

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
    <li v-if="!isDemo" :class="isSide ? '' : 'w-28'">
      <NuxtLink
        to="/profile"
        :class="itemClass"
        class="font-extrabold text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <PathIcon name="user" :class="iconClass" />
        <span>Profile</span>
      </NuxtLink>
    </li>
  </ul>
</template>
