<script setup lang="ts">
import type { HobbyEntry } from '~/utils/hobby-store'

/**
 * Desktop left sidebar: logo, main navigation and the hobby list (Req 12.3;
 * spec: local-progress-data, Req 4.1).
 */
defineProps<{ hobbies: readonly HobbyEntry[]; activeId: string | null }>()
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

    <PathHobbyList :hobbies="hobbies" :active-id="activeId" heading-id="sidebar-hobbies" layout="sidebar" />
  </nav>
</template>
