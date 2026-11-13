<script setup lang="ts">
import { computed } from 'vue'

/**
 * Main navigation (Req 12.7), with the item of the open page marked. "Path", "Quests" and "Profile" are shown;
 * Fresh stays hidden until that feature ships (spec: local-progress-data, Req 5.1).
 * Demo_Mode has no account, so it shows no Quests or Profile item (spec: accounts-cloud-save, Req 11.1, 12.6;
 * spec: quests-page, Req 1.2, 1.3, 1.4, 15.4). Three w-28 items fit the 390px bottom bar (3 x 112px = 336px).
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

const ACTIVE_CLASS = 'bg-primary-soft text-accent-text'
const IDLE_CLASS = 'text-muted hover:bg-surface-2 hover:text-ink'
const onSettings = computed(() => route.path === '/settings')
/**
 * On Settings the sidebar marks its own Settings link; the bottom bar has none,
 * so there Settings marks the Profile item it is opened from.
 */
const onProfile = computed(() => route.path === '/profile' || (onSettings.value && !isSide.value))
const onQuests = computed(() => route.path === '/quests')
const onPath = computed(() => !onProfile.value && !onSettings.value && !onQuests.value)
</script>

<template>
  <ul :class="isSide ? 'flex flex-col gap-1.5' : 'flex h-full justify-center'">
    <li :class="isSide ? '' : 'w-28'">
      <NuxtLink
        to="/path"
        :aria-current="onPath ? 'page' : undefined"
        :class="[itemClass, onPath ? ACTIVE_CLASS : IDLE_CLASS]"
        class="font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <PathIcon name="map" :class="iconClass" />
        <span>Path</span>
      </NuxtLink>
    </li>
    <li v-if="!isDemo" :class="isSide ? '' : 'w-28'">
      <NuxtLink
        to="/quests"
        :aria-current="onQuests ? 'page' : undefined"
        :class="[itemClass, onQuests ? ACTIVE_CLASS : IDLE_CLASS]"
        class="font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <PathIcon name="target" :class="iconClass" />
        <span>Quests</span>
      </NuxtLink>
    </li>
    <li v-if="!isDemo" :class="isSide ? '' : 'w-28'">
      <NuxtLink
        to="/profile"
        :aria-current="route.path === '/profile' ? 'page' : onProfile ? 'true' : undefined"
        :class="[itemClass, onProfile ? ACTIVE_CLASS : IDLE_CLASS]"
        class="font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <PathIcon name="user" :class="iconClass" />
        <span>Profile</span>
      </NuxtLink>
    </li>
  </ul>
</template>
