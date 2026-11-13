<script setup lang="ts">
import { NEW_HOBBY_PATH } from '~/utils/hobby-store'
import type { ProfileHobby } from '~/utils/profile-stats'

/**
 * "Your hobbies" card of the Profile_Page: one link per path with its skills,
 * level and progress, and "+ Add a hobby". `activeId` marks the Active_Hobby.
 */
defineProps<{ hobbies: readonly ProfileHobby[]; activeId: string | null }>()

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
</script>

<template>
  <section aria-labelledby="profile-hobbies" class="flex flex-col gap-3 rounded-3xl border-2 border-line bg-surface p-4 lg:px-5.5 lg:py-5">
    <h2 id="profile-hobbies" class="font-head text-[21px] font-semibold text-ink">Your hobbies</h2>
    <ul v-if="hobbies.length > 0" class="flex flex-col gap-3">
      <li v-for="entry in hobbies" :key="entry.id">
        <NuxtLink
          :to="entry.to"
          :class="[
            'flex flex-col gap-2 rounded-2xl border-2 bg-surface px-4 py-3.5 text-ink hover:border-ink',
            entry.id === activeId ? 'border-ink' : 'border-line',
            focusRing,
          ]"
        >
          <span class="flex items-baseline justify-between gap-2">
            <span class="min-w-0 truncate text-base font-extrabold">{{ entry.hobby }}</span>
            <span class="shrink-0 text-[13px] font-bold text-muted">
              {{ entry.done }} of {{ entry.total }} skills · Lv {{ entry.level }}
            </span>
          </span>
          <span aria-hidden="true" class="block h-2.5 w-full overflow-hidden rounded-full bg-locked">
            <span class="block h-full bg-done" :style="{ width: `${entry.percent}%` }" />
          </span>
        </NuxtLink>
      </li>
    </ul>
    <p v-else class="text-[15px] leading-normal text-muted">No paths yet. Pick a hobby and Wick builds your first one.</p>
    <NuxtLink
      :to="NEW_HOBBY_PATH"
      :class="[
        'flex h-12.5 items-center justify-center rounded-2xl border-2 border-dashed border-locked-deep text-[15px] font-extrabold text-muted hover:bg-surface-2',
        focusRing,
      ]"
    >
      + Add a hobby
    </NuxtLink>
  </section>
</template>
