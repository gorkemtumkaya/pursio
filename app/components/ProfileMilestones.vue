<script setup lang="ts">
import { computed } from 'vue'
import type { ProfileMilestone } from '~/utils/profile-stats'

/**
 * "Milestones" card of the Profile_Page: a gold trophy for each earned
 * milestone and a lock for the rest. Mobile shows the first four.
 */
const props = defineProps<{ milestones: readonly ProfileMilestone[] }>()

const earned = computed(() => props.milestones.filter((milestone) => milestone.earned).length)
</script>

<template>
  <section aria-labelledby="profile-milestones" class="flex flex-col gap-3 rounded-3xl border-2 border-line bg-surface p-4 lg:px-5.5 lg:py-5">
    <div class="flex items-baseline justify-between gap-3">
      <h2 id="profile-milestones" class="font-head text-[21px] font-semibold text-ink">Milestones</h2>
      <span class="text-[13px] font-bold text-muted">{{ earned }} of {{ milestones.length }}</span>
    </div>
    <ul class="grid grid-cols-4 gap-3">
      <li
        v-for="(milestone, index) in milestones"
        :key="milestone.id"
        class="flex-col items-center gap-1.5 text-center text-xs leading-tight font-extrabold"
        :class="[milestone.earned ? 'text-ink' : 'text-muted', index < 4 ? 'flex' : 'hidden lg:flex']"
      >
        <span
          aria-hidden="true"
          class="flex size-15 items-center justify-center rounded-full"
          :class="milestone.earned ? 'bg-gold text-gold-ink shadow-raised-gold' : 'bg-locked text-locked-ink'"
        >
          <PathIcon :name="milestone.earned ? 'trophy' : 'lock'" :class="milestone.earned ? 'size-7' : 'size-5.5'" />
        </span>
        <span>{{ milestone.label }}<span class="sr-only">{{ milestone.earned ? ', earned' : ', locked' }}</span></span>
      </li>
    </ul>
  </section>
</template>
