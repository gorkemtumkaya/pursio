<script setup lang="ts">
import type { XpSummary } from '#shared/utils/xp'
import MascotWick from '~/components/mascot/wick.vue'
import type { WickOutfit, WickTheme } from '~/components/mascot/wick'

/**
 * Top card of the Profile_Page: Wick in the hobby's outfit, the learner's name,
 * level and XP over all paths, and four totals. On mobile a gear button opens
 * the Settings_Page, which desktop reaches from the sidebar.
 */
defineProps<{
  name: string
  /** Line next to the name, e.g. "With Wick since November 2026". */
  kicker: string
  xp: XpSummary
  streak: number
  skillsDone: number
  questsDone: number
  theme: WickTheme
  outfit: WickOutfit
}>()
</script>

<template>
  <section
    aria-labelledby="profile-name"
    class="relative grid grid-cols-[92px_minmax(0,1fr)] gap-3 rounded-3xl border-2 border-line bg-surface px-4 pt-3.5 pb-4 shadow-raised-line lg:flex lg:flex-wrap lg:items-center lg:gap-6 lg:px-7 lg:py-6"
  >
    <span
      class="flex h-25 items-end justify-center overflow-hidden rounded-3xl bg-primary-soft lg:h-47.5 lg:w-42.5 lg:shrink-0"
    >
      <MascotWick
        :theme="theme"
        :outfit="outfit"
        mood="cheer"
        aria-hidden="true"
        class="h-[103px] w-[86px] lg:h-48 lg:w-40"
      />
    </span>

    <div class="flex min-w-0 flex-col gap-1 pr-13 lg:flex-[1_1_320px] lg:gap-2.5 lg:pr-0">
      <h1
        id="profile-name"
        class="order-1 font-display text-[26px] leading-tight font-semibold break-words text-ink lg:order-2 lg:text-[44px] lg:leading-none"
      >
        {{ name }}
      </h1>
      <span class="order-2 text-xs font-extrabold text-muted lg:order-1 lg:text-[13px] lg:tracking-widest lg:uppercase">
        {{ kicker }}
      </span>
      <div class="order-3 flex items-center gap-3 text-sm font-bold">
        <span class="shrink-0 rounded-lg bg-ink px-2.5 py-0.5 font-head text-sm font-semibold text-bg lg:px-3 lg:py-1 lg:text-base">
          Level {{ xp.level }}
        </span>
        <PathXpBar :percent="xp.barPercent" class="hidden h-3.5 max-w-80 flex-1 lg:block" />
        <span class="hidden whitespace-nowrap text-muted lg:inline">{{ xp.label }}</span>
      </div>
    </div>

    <div class="col-span-full flex items-center gap-2.5 text-[13px] font-bold lg:hidden">
      <PathXpBar :percent="xp.barPercent" class="flex-1" />
      <span class="whitespace-nowrap text-muted">{{ xp.label }}</span>
    </div>

    <dl class="col-span-full grid grid-cols-3 gap-2.5 lg:flex-[0_1_300px] lg:grid-cols-2">
      <div class="flex flex-col-reverse gap-0.5 rounded-2xl bg-surface-2 px-3.5 py-3">
        <dt class="text-xs font-extrabold text-muted">Day streak</dt>
        <dd class="font-head text-2xl font-semibold text-accent-text lg:text-[26px]">{{ streak }}</dd>
      </div>
      <div class="flex flex-col-reverse gap-0.5 rounded-2xl bg-surface-2 px-3.5 py-3">
        <dt class="text-xs font-extrabold text-muted">Skills done</dt>
        <dd class="font-head text-2xl font-semibold text-ink lg:text-[26px]">{{ skillsDone }}</dd>
      </div>
      <div class="flex flex-col-reverse gap-0.5 rounded-2xl bg-surface-2 px-3.5 py-3">
        <dt class="text-xs font-extrabold text-muted">Quests done</dt>
        <dd class="font-head text-2xl font-semibold text-ink lg:text-[26px]">{{ questsDone }}</dd>
      </div>
      <!-- On mobile the XP text under the bar already shows the total. -->
      <div class="hidden flex-col-reverse gap-0.5 rounded-2xl bg-surface-2 px-3.5 py-3 lg:flex">
        <dt class="text-xs font-extrabold text-muted">Total XP</dt>
        <dd class="font-head text-[26px] font-semibold text-ink">{{ xp.xp }}</dd>
      </div>
    </dl>

    <!-- Mobile only: the bottom bar has no Settings item; desktop has the sidebar link. -->
    <NuxtLink
      to="/settings"
      aria-label="Settings"
      class="absolute top-3.5 right-4 flex size-11 items-center justify-center rounded-2xl border-2 border-line bg-surface text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:hidden"
    >
      <PathIcon name="settings" class="size-5" />
    </NuxtLink>
  </section>
</template>
