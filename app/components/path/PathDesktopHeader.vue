<script setup lang="ts">
import type { XpSummary } from '#shared/utils/xp'
import MascotWick from '~/components/mascot/wick.vue'
import type { WickOutfit, WickTheme } from '~/components/mascot/wick'

/**
 * Desktop header (Req 11.8): "YOUR PATH" eyebrow, the hobby title, then
 * streak, level, XP bar and XP text. Wick stands on the right in the hobby's
 * outfit; it is decorative, so screen readers skip it.
 */
defineProps<{ hobby: string; xp: XpSummary; streak: number; theme: WickTheme; outfit: WickOutfit }>()
</script>

<template>
  <header class="flex w-full items-end justify-between gap-4">
    <div class="flex min-w-0 flex-col gap-3">
      <div class="flex flex-col gap-1">
        <span class="text-[13px] font-extrabold tracking-widest text-muted">YOUR PATH</span>
        <h1 class="font-display text-[40px] leading-none font-semibold text-ink">{{ hobby }}</h1>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] font-extrabold text-ink">
        <span class="flex items-center gap-1.5">
          <PathIcon name="flame" class="size-5.5 text-accent-text" />
          {{ streak }} day streak
        </span>
        <span class="flex items-center gap-2.5">
          <span class="font-head">Lv {{ xp.level }}</span>
          <PathXpBar :percent="xp.barPercent" class="w-35" />
          <span class="text-muted">{{ xp.label }}</span>
        </span>
      </div>
    </div>
    <MascotWick :theme="theme" :outfit="outfit" mood="idle" :size="104" aria-hidden="true" class="shrink-0" />
  </header>
</template>
