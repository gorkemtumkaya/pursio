<script setup lang="ts">
import { computed } from 'vue'
import type { IconName } from '~/utils/icons'

/**
 * Main navigation items. "Path" is the only real route; the other items are
 * static placeholders that do nothing when activated (Req 12.7, 12.8).
 */
const props = defineProps<{ variant: 'bottom' | 'side' }>()

interface NavItem {
  icon: IconName
  label: string
}

const placeholders = computed<NavItem[]>(() => [
  { icon: 'feed', label: props.variant === 'side' ? 'Fresh feed' : 'Fresh' },
  { icon: 'target', label: 'Quests' },
  { icon: 'user', label: 'Profile' },
])

const isSide = computed(() => props.variant === 'side')

const itemClass = computed(() =>
  isSide.value
    ? 'flex h-12 w-full items-center gap-3 rounded-2xl px-3.5 text-[15px]'
    : 'flex h-full min-h-11 w-full min-w-11 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs',
)
const iconClass = computed(() => (isSide.value ? 'size-5.5 shrink-0' : 'size-6 shrink-0'))
</script>

<template>
  <ul :class="isSide ? 'flex flex-col gap-1.5' : 'grid h-full grid-cols-4 gap-1'">
    <li>
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
    <li v-for="item in placeholders" :key="item.icon">
      <button
        type="button"
        :class="itemClass"
        class="font-bold text-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <PathIcon :name="item.icon" :class="iconClass" />
        <span>{{ item.label }}</span>
      </button>
    </li>
  </ul>
</template>
