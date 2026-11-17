<script setup lang="ts">
import { computed, useId } from 'vue'
import type { SourceGroupView } from '#shared/utils/fresh-view'
import { channelCountText } from '~/utils/fresh-page'

/**
 * One hobby of the Sources_Panel accordion (spec: fresh-v2, Req 8.2, 8.4 to 8.6, 11.1). The
 * header shows a dot in the hobby color, the hobby and "1 channel", "<n> channels" or "none
 * yet". With channels it is a button that opens and closes the list (`aria-expanded`), with
 * a chevron. With none it is a plain row that cannot open. The list shows each channel with
 * its mute switch, or the name only in Demo_Mode; muted channels stay listed.
 */
const props = defineProps<{ group: SourceGroupView; open: boolean; demo: boolean }>()

const emit = defineEmits<{ toggle: []; mute: [channelId: string, muted: boolean] }>()

const listId = `fresh-sources-${useId()}`
const count = computed(() => channelCountText(props.group.entries.length))
const expandable = computed(() => props.group.entries.length > 0)
const expanded = computed(() => expandable.value && props.open)
</script>

<template>
  <div :data-hobby-slot="group.colorSlot" class="flex flex-col">
    <h3>
      <button
        v-if="expandable"
        type="button"
        :aria-expanded="expanded"
        :aria-controls="listId"
        class="flex min-h-11 w-full items-center gap-2.5 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        @click="emit('toggle')"
      >
        <span class="size-2.5 shrink-0 rounded-full bg-hobby-deep" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate font-head text-[15px] font-extrabold text-ink">{{ group.hobby }}</span>
        <span class="shrink-0 text-sm font-semibold text-muted">{{ count }}</span>
        <PathIcon
          name="chevron"
          class="size-5 shrink-0 text-muted transition-transform motion-reduce:transition-none"
          :class="expanded ? 'rotate-180' : ''"
        />
      </button>
      <span v-else class="flex min-h-11 w-full items-center gap-2.5">
        <span class="size-2.5 shrink-0 rounded-full bg-hobby-deep" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate font-head text-[15px] font-extrabold text-ink">{{ group.hobby }}</span>
        <span class="shrink-0 text-sm font-semibold text-muted">{{ count }}</span>
      </span>
    </h3>
    <ul v-if="expandable" v-show="expanded" :id="listId" class="flex flex-col pb-2 pl-5">
      <li v-for="entry in group.entries" :key="entry.channelId" class="flex min-h-11 items-center justify-between gap-3">
        <span class="min-w-0 text-[15px] leading-tight font-bold break-words" :class="entry.muted ? 'text-muted' : 'text-ink'">
          {{ entry.channelName }}
        </span>
        <FreshMuteSwitch
          v-if="!demo"
          :channel-name="entry.channelName"
          :muted="entry.muted"
          @change="(muted) => emit('mute', entry.channelId, muted)"
        />
      </li>
    </ul>
  </div>
</template>
