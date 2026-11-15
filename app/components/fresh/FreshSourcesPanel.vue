<script setup lang="ts">
import type { SourceGroupView } from '#shared/utils/fresh-view'

/**
 * "Your sources" (spec: fresh, Req 15.1 to 15.3, 15.7 to 15.10, 11.10): Channel_Sources grouped
 * by hobby, each with a mute switch outside Demo_Mode; muted channels stay listed. A hobby with
 * no source shows "No sources yet for <hobby>.". The fixed note closes the panel.
 */
defineProps<{
  groups: readonly SourceGroupView[]
  demo: boolean
  headingId: string
  /** No card frame: the sheet already gives one. */
  bare?: boolean
}>()

const emit = defineEmits<{ mute: [channelId: string, muted: boolean] }>()

const NOTE =
  'Every day Pursio checks these channels, picks new videos for the skills on your path and checks them for your level. Videos play from YouTube; nothing is copied.'
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-4" :class="bare ? '' : 'rounded-3xl border-2 border-line bg-surface p-5'">
    <h2 :id="headingId" class="font-display text-xl text-ink" tabindex="-1">Your sources</h2>
    <div v-for="group in groups" :key="group.key" class="flex flex-col gap-1.5">
      <h3 class="font-head text-[13px] font-extrabold tracking-wider text-muted uppercase">{{ group.hobby }}</h3>
      <p v-if="group.entries.length === 0" class="text-sm text-muted">No sources yet for {{ group.hobby }}.</p>
      <ul v-else class="flex flex-col">
        <li v-for="entry in group.entries" :key="entry.channelId" class="flex min-h-11 items-center justify-between gap-3">
          <span class="min-w-0 font-head text-[15px] leading-tight font-bold break-words" :class="entry.muted ? 'text-muted' : 'text-ink'">
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
    <p class="text-sm leading-relaxed text-muted">{{ NOTE }}</p>
  </section>
</template>
