<script setup lang="ts">
import type { XpSummary } from '#shared/utils/xp'

/**
 * Mobile header, two rows (Req 11.7): hobby switcher, streak and XP on top;
 * level, XP bar and XP text below. The hobby switcher is a no-op (Req 12.8).
 */
defineProps<{ hobby: string; xp: XpSummary; streak: number }>()
</script>

<template>
  <header class="flex flex-col gap-3 px-5 pt-3.5">
    <h1 class="sr-only">{{ hobby }}</h1>
    <div class="flex items-center justify-between gap-3">
      <button
        type="button"
        class="flex h-11 min-w-11 items-center gap-2 rounded-2xl border-2 border-line bg-surface pr-3 pl-1.5 text-[15px] font-extrabold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span
          class="flex size-7.5 shrink-0 items-center justify-center rounded-node bg-primary text-primary-ink"
        >
          <PathIcon name="mountain" class="size-4.5" />
        </span>
        <span><span class="sr-only">Switch hobby: </span>{{ hobby }}</span>
        <PathIcon name="chevron" class="size-4" />
      </button>
      <div class="flex items-center gap-3.5 text-[15px] font-extrabold text-ink">
        <span class="flex items-center gap-1">
          <PathIcon name="flame" class="size-5 text-accent-text" />
          {{ streak }}<span class="sr-only"> day streak</span>
        </span>
        <span class="flex items-center gap-1">
          <PathIcon name="bolt" class="size-5 text-gold-deep" />
          {{ xp.xp }}<span class="sr-only"> XP</span>
        </span>
      </div>
    </div>
    <div class="flex items-center gap-2.5 text-sm font-bold">
      <span class="font-head text-[15px] text-ink">Lv {{ xp.level }}</span>
      <PathXpBar :percent="xp.barPercent" class="flex-1" />
      <span class="text-muted">{{ xp.label }}</span>
    </div>
  </header>
</template>
