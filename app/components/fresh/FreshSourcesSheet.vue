<script setup lang="ts">
import type { SourceGroupView } from '#shared/utils/fresh-view'

/**
 * Mobile Sources sheet (spec: fresh, Req 15.5): the Sources_Panel in a bottom sheet that traps
 * focus (`useFocusTrap` inside `PathBottomSheet`) and closes with its close button, the backdrop
 * or Escape. The page returns focus to the "Sources" button on `close`.
 */
defineProps<{ open: boolean; groups: readonly SourceGroupView[]; demo: boolean }>()

const emit = defineEmits<{ close: []; mute: [channelId: string, muted: boolean] }>()

const HEADING_ID = 'fresh-sources-sheet-heading'
</script>

<template>
  <PathBottomSheet :open="open" :labelled-by="HEADING_ID" @close="emit('close')">
    <div class="pt-3 pr-12">
      <FreshSourcesPanel
        :groups="groups"
        :demo="demo"
        :heading-id="HEADING_ID"
        bare
        @mute="(id, muted) => emit('mute', id, muted)"
      />
    </div>
  </PathBottomSheet>
</template>
