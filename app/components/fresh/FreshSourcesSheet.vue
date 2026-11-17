<script setup lang="ts">
import type { SourceGroupView } from '#shared/utils/fresh-view'

/**
 * Mobile Sources sheet (spec: fresh-v2, Req 8.8; `fresh` Req 15.5): the Sources_Panel, with
 * the same accordion state, in a bottom sheet that traps focus (`useFocusTrap` inside
 * `PathBottomSheet`) and closes with its close button, the backdrop or Escape. The page
 * returns focus to the "Sources" button on `close`.
 */
defineProps<{
  open: boolean
  groups: readonly SourceGroupView[]
  /** Keys of the open accordion groups. */
  openGroups: ReadonlySet<string>
  demo: boolean
}>()

const emit = defineEmits<{ close: []; mute: [channelId: string, muted: boolean]; toggle: [key: string] }>()

const HEADING_ID = 'fresh-sources-sheet-heading'
</script>

<template>
  <PathBottomSheet :open="open" :labelled-by="HEADING_ID" @close="emit('close')">
    <div class="pt-3 pr-12">
      <FreshSourcesPanel
        :groups="groups"
        :open="openGroups"
        :demo="demo"
        :heading-id="HEADING_ID"
        bare
        @mute="(id, muted) => emit('mute', id, muted)"
        @toggle="(key) => emit('toggle', key)"
      />
    </div>
  </PathBottomSheet>
</template>
