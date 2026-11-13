<script setup lang="ts">
/**
 * Page frame of the Profile_Page and the Settings_Page: the desktop sidebar
 * with the logo, the main navigation and a Settings link pinned to the bottom,
 * and the bottom navigation on mobile. The page puts its `<main>` in the slot.
 */
import { computed } from 'vue'

const route = useRoute()
const onSettings = computed(() => route.path === '/settings')
</script>

<template>
  <div class="lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
    <div class="hidden lg:block">
      <nav aria-label="Main" class="sticky top-0 flex h-dvh flex-col gap-7 overflow-y-auto border-r-2 border-line px-5 py-7">
        <div class="flex items-center gap-2.5">
          <span
            class="flex size-9.5 shrink-0 items-center justify-center rounded-node bg-primary text-primary-ink shadow-raised-primary"
          >
            <PathIcon name="star" class="size-5.5" />
          </span>
          <span class="font-head text-[26px] font-bold text-ink">Pursio</span>
        </div>
        <PathNavItems variant="side" />
        <NuxtLink
          to="/settings"
          :aria-current="onSettings ? 'page' : undefined"
          class="mt-auto flex h-12 w-full shrink-0 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          :class="onSettings ? 'bg-primary-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-ink'"
        >
          <PathIcon name="settings" class="size-5.5 shrink-0" />
          <span>Settings</span>
        </NuxtLink>
      </nav>
    </div>
    <slot />
  </div>

  <div class="lg:hidden">
    <PathBottomNav />
  </div>
</template>
