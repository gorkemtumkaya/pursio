<script setup lang="ts">
import { freshMeta, type FreshItem } from '~/utils/fresh-samples'

/**
 * "Fresh this week" cards (Req 8.6). Static `<article>` cards, not links,
 * because there are no content routes yet. The sheet shows a horizontal row,
 * the panel a vertical list.
 */
defineProps<{ items: readonly FreshItem[]; layout: 'sheet' | 'panel' }>()
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <h3 class="text-[13px] font-extrabold tracking-wider text-muted">FRESH THIS WEEK</h3>

    <div
      v-if="layout === 'sheet'"
      role="region"
      aria-label="Fresh this week"
      tabindex="0"
      class="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 focus-visible:outline-2 focus-visible:outline-ink"
    >
      <article v-for="(item, index) in items" :key="index" class="flex w-42 shrink-0 flex-col gap-1.5 text-ink">
        <div
          aria-hidden="true"
          class="flex h-21 items-center justify-center rounded-2xl text-ink"
          :class="item.kind === 'video' ? 'bg-primary-soft' : 'bg-surface-2'"
        >
          <PathIcon :name="item.kind === 'video' ? 'play' : 'article'" class="size-7" />
        </div>
        <h4 class="text-sm leading-tight font-extrabold">{{ item.title }}</h4>
        <p class="text-xs font-bold text-muted">{{ freshMeta(item) }} · {{ item.source }}</p>
      </article>
    </div>

    <div v-else class="flex flex-col gap-3">
      <article v-for="(item, index) in items" :key="index" class="flex items-center gap-3 text-ink">
        <div
          aria-hidden="true"
          class="flex h-15 w-22 shrink-0 items-center justify-center rounded-xl text-ink"
          :class="item.kind === 'video' ? 'bg-primary-soft' : 'bg-surface-2'"
        >
          <PathIcon :name="item.kind === 'video' ? 'play' : 'article'" class="size-6" />
        </div>
        <div class="flex min-w-0 flex-col gap-0.5">
          <h4 class="text-[15px] leading-tight font-extrabold">{{ item.title }}</h4>
          <p class="text-[13px] font-bold text-muted">{{ freshMeta(item) }} · {{ item.source }}</p>
        </div>
      </article>
    </div>
  </div>
</template>
