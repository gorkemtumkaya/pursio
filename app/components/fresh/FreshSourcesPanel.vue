<script setup lang="ts">
import type { SourceGroupView } from '#shared/utils/fresh-view'

/**
 * "Your sources" (spec: fresh-v2, Req 8.1 to 8.7, 11.1): the subtitle, one accordion group
 * per hobby in Path_Order and the closing line. Which groups are open comes from the page,
 * so the desktop panel and the mobile sheet share it; several may be open at once.
 */
defineProps<{
  groups: readonly SourceGroupView[]
  /** Keys of the open groups. */
  open: ReadonlySet<string>
  demo: boolean
  headingId: string
  /** No card frame: the sheet already gives one. */
  bare?: boolean
}>()

const emit = defineEmits<{ mute: [channelId: string, muted: boolean]; toggle: [key: string] }>()
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-3" :class="bare ? '' : 'rounded-3xl border-2 border-line bg-surface p-5'">
    <div class="flex flex-col gap-1">
      <h2 :id="headingId" class="font-display text-xl text-ink" tabindex="-1">Your sources</h2>
      <p class="text-sm leading-snug text-muted">The channels Pursio checks every day, grouped by hobby.</p>
    </div>
    <div class="flex flex-col">
      <FreshSourcesGroup
        v-for="group in groups"
        :key="group.key"
        :group="group"
        :open="open.has(group.key)"
        :demo="demo"
        class="border-t-2 border-line first:border-t-0"
        @toggle="emit('toggle', group.key)"
        @mute="(id, muted) => emit('mute', id, muted)"
      />
    </div>
    <p class="text-xs leading-relaxed text-muted">Videos play from YouTube; nothing is copied.</p>
  </section>
</template>
