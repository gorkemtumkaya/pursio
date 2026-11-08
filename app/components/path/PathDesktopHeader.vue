<script setup lang="ts">
import type { XpSummary } from '#shared/utils/xp'

/**
 * Desktop header (Req 11.8): "YOUR PATH" eyebrow and the hobby title on the
 * left, streak, level, XP bar and XP text on the right.
 */
defineProps<{ hobby: string; xp: XpSummary; streak: number }>()
</script>

<template>
  <header class="flex w-full flex-wrap items-end justify-between gap-4">
    <div class="flex flex-col gap-1">
      <span class="text-[13px] font-extrabold tracking-widest text-muted">YOUR PATH</span>
      <h1 class="font-display text-[40px] leading-none font-semibold text-ink">{{ hobby }}</h1>
    </div>
    <div class="flex items-center gap-4 text-[15px] font-extrabold text-ink">
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
  </header>
</template>
