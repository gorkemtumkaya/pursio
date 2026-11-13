<script setup lang="ts">
import type { PathCard } from '~/utils/quests-view'

/**
 * One card of "From your path": a single link to the path of the Active_Hobby (Req 11.5).
 * Desktop shows label, bar and "Next" line; mobile shows one row (Req 11.3, 11.4, 11.7).
 * Both sit in the DOM inside the same link, so there is one tab stop per card.
 */
defineProps<{ card: PathCard; to: string }>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="block rounded-3xl border-2 border-line bg-surface text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
  >
    <div class="hidden p-5 lg:block">
      <p class="text-xs font-extrabold tracking-wide text-accent-text uppercase">{{ card.label }}</p>
      <p class="mt-1 font-head text-lg font-semibold">{{ card.node.title }}</p>
      <PathXpBar class="mt-3" :percent="card.percent" label="Quests done" />
      <p class="mt-3 text-sm font-bold text-muted">
        <template v-if="card.nextText !== null">Next: {{ card.nextText }}</template>
        <template v-else>All quests done. Mark the skill complete on your path.</template>
      </p>
    </div>

    <div class="flex min-h-14 items-center gap-3 px-4 py-3 lg:hidden">
      <div class="min-w-0 flex-1">
        <p class="truncate text-[15px] font-extrabold">{{ card.node.title }}</p>
        <p class="text-xs font-bold text-muted">{{ card.ticked }} of 3 quests</p>
      </div>
      <PathIcon name="chevron" class="size-4 shrink-0 -rotate-90 text-muted" aria-hidden="true" />
    </div>
  </NuxtLink>
</template>
