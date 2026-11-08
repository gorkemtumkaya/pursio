<script setup lang="ts">
/**
 * Section_Header in a fixed band (Req 7.1–7.5). Banner for the Active_Section,
 * Divider for every other Section. The parent positions the band.
 */
defineProps<{
  eyebrow: string
  title: string
  variant: 'banner' | 'divider'
  count?: { done: number; total: number } | null
  lockedBy?: string | null
  height: number
}>()
</script>

<template>
  <div class="flex items-center" :style="{ height: `${height}px` }">
    <section
      v-if="variant === 'banner'"
      class="flex w-full items-center justify-between gap-4 rounded-3xl bg-banner px-4.5 py-4 text-banner-ink shadow-raised-banner lg:px-5.5 lg:py-4.5"
    >
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-xs font-extrabold tracking-[0.08em] text-banner-muted">{{ eyebrow }}</span>
        <h2 class="font-display text-2xl font-semibold lg:text-[28px]">{{ title }}</h2>
      </div>
      <span v-if="count" class="shrink-0 font-head text-lg font-semibold lg:text-xl">
        {{ count.done }}/{{ count.total }} skills
      </span>
    </section>

    <section v-else class="flex w-full items-center gap-4">
      <span aria-hidden="true" class="h-0.5 flex-1 bg-line" />
      <div class="flex flex-col items-center gap-1 text-center">
        <span class="text-xs font-extrabold tracking-[0.08em] text-muted">{{ eyebrow }}</span>
        <h2 class="font-display text-2xl font-semibold text-ink lg:text-[28px]">{{ title }}</h2>
        <span v-if="lockedBy" class="flex items-center gap-1.5 text-[13px] font-bold text-muted">
          <PathIcon name="lock" class="size-4" />
          Reach {{ lockedBy }} to unlock
        </span>
      </div>
      <span aria-hidden="true" class="h-0.5 flex-1 bg-line" />
    </section>
  </div>
</template>
