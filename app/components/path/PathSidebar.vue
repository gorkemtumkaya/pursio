<script setup lang="ts">
import type { HobbyEntry } from '~/utils/hobby-store'

/**
 * Desktop left sidebar: logo, main navigation and the hobby list (Req 12.3;
 * spec: local-progress-data, Req 4.1), with a Settings link pinned to the bottom.
 */
defineProps<{ hobbies: readonly HobbyEntry[]; archived: readonly HobbyEntry[]; activeId: string | null }>()
const emit = defineEmits<{ archive: [entry: HobbyEntry]; delete: [entry: HobbyEntry]; restore: [entry: HobbyEntry] }>()
</script>

<template>
  <nav
    aria-label="Main"
    class="sticky top-0 flex h-dvh flex-col gap-7 overflow-y-auto border-r-2 border-line px-5 py-7"
  >
    <div class="flex items-center gap-2.5">
      <span
        class="flex size-9.5 shrink-0 items-center justify-center rounded-node bg-primary text-primary-ink shadow-raised-primary"
      >
        <PathIcon name="star" class="size-5.5" />
      </span>
      <span class="font-head text-[26px] font-bold text-ink">Pursio</span>
    </div>

    <PathNavItems variant="side" />

    <PathHobbyList
      :hobbies="hobbies"
      :archived="archived"
      :active-id="activeId"
      heading-id="sidebar-hobbies"
      layout="sidebar"
      @archive="emit('archive', $event)"
      @delete="emit('delete', $event)"
      @restore="emit('restore', $event)"
    />

    <NuxtLink
      to="/settings"
      class="mt-auto flex h-12 w-full shrink-0 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-extrabold text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <PathIcon name="settings" class="size-5.5 shrink-0" />
      <span>Settings</span>
    </NuxtLink>
  </nav>
</template>
