<script setup lang="ts">
import { computed } from 'vue'
import { navItems } from '~/utils/nav-items'

/**
 * Main navigation (Req 12.7), with the item of the open page marked: Path, Fresh, Quests and Profile
 * (spec: fresh, Req 10.1 to 10.8). Demo_Mode has no account, so it shows only Path and Fresh, both
 * keeping the demo (`/path?demo=1`, `/fresh?demo=1`) (spec: accounts-cloud-save, Req 11.1, 12.6;
 * spec: quests-page, Req 1.2 to 1.4, 15.4). Four w-22 items fit the 390px bottom bar
 * (4 x 88px = 352px), each with a 44px minimum target.
 */
const props = defineProps<{ variant: 'bottom' | 'side' }>()

const route = useRoute()
const isDemo = computed(() => route.query.demo === '1')

const isSide = computed(() => props.variant === 'side')

const items = computed(() => navItems(route.path, isDemo.value, props.variant))

const itemClass = computed(() =>
  isSide.value
    ? 'flex h-12 w-full items-center gap-3 rounded-2xl px-3.5 text-[15px]'
    : 'flex h-full min-h-11 w-full min-w-11 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs',
)
const iconClass = computed(() => (isSide.value ? 'size-5.5 shrink-0' : 'size-6 shrink-0'))

const ACTIVE_CLASS = 'bg-primary-soft text-accent-text'
const IDLE_CLASS = 'text-muted hover:bg-surface-2 hover:text-ink'
</script>

<template>
  <ul :class="isSide ? 'flex flex-col gap-1.5' : 'flex h-full justify-center'">
    <li v-for="item in items" :key="item.key" :class="isSide ? '' : 'w-22'">
      <NuxtLink
        :to="item.to"
        :aria-current="item.current"
        :class="[itemClass, item.active ? ACTIVE_CLASS : IDLE_CLASS]"
        class="font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <PathIcon :name="item.icon" :class="iconClass" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>
