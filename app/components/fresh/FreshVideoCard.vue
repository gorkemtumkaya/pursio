<script setup lang="ts">
import { computed } from 'vue'
import type { RankedVideo } from '#shared/types/video'
import { isAllowedThumbnail } from '#shared/utils/fresh-view'
import type { FreshShownVideo } from '~/utils/fresh-actions'

/**
 * One card of the New_Section, the Best_Section or the "Saved" view (spec: fresh, Req 13.2,
 * 13.4, 13.6, 13.8 to 13.12, 18.3). It wraps `WatchVideoCard` (list cards below `md`) with the
 * Why_Line, the "New" badge, the skill tag and the save control. A thumbnail renders only from
 * `i.ytimg.com`; any other URL shows the neutral block. No XP is shown (Req 11.9).
 */
const props = defineProps<{
  video: FreshShownVideo
  poolLanguage: string
  /** The user's Language_Code. */
  language: string
  active: boolean
  /** Fresh_Items only. */
  why?: string | null
  isNew?: boolean
  skillTitle?: string | null
  /** Path page with the Skill_Sheet open (Req 13.4). */
  skillTo?: string | null
  /** False in Demo_Mode (decision D13). */
  showSave: boolean
  saved: boolean
}>()

const emit = defineEmits<{
  play: []
  stop: []
  skipped: []
  toggleSave: []
  playing: []
  progress: [seconds: number]
}>()

const ranked = computed<RankedVideo>(() => ({
  id: props.video.videoId,
  title: props.video.title,
  channel: props.video.channel,
  channelId: props.video.channelId,
  thumbnailUrl: isAllowedThumbnail(props.video.thumbnailUrl) ? props.video.thumbnailUrl : '',
  durationSeconds: props.video.durationSeconds,
  // Not shown on the card; WatchVideoCard only needs the field.
  style: 'technique',
  matchedQuestText: null,
  poolLanguage: props.poolLanguage,
}))
</script>

<template>
  <WatchVideoCard
    :video="ranked"
    :language="language"
    :active="active"
    layout="auto"
    @play="emit('play')"
    @skipped="emit('skipped')"
  >
    <template #player>
      <WatchEmbedPlayer
        :key="video.videoId"
        :video-id="video.videoId"
        :title="video.title"
        @playing="emit('playing')"
        @progress="(seconds) => emit('progress', seconds)"
      />
      <div class="flex items-start justify-between gap-2 px-1 pb-1">
        <div class="flex min-w-0 flex-1 flex-col">
          <span class="text-[15px] leading-snug font-bold text-ink">{{ video.title }}</span>
          <span class="text-xs font-semibold text-muted">{{ video.channel }}</span>
        </div>
        <FreshSaveButton v-if="showSave" :saved="saved" :title="video.title" @toggle="emit('toggleSave')" />
        <button
          type="button"
          class="min-h-11 shrink-0 rounded-xl border-2 border-line px-3 text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          @click="emit('stop')"
        >
          Close video
        </button>
      </div>
    </template>
    <template #meta>
      <p v-if="why" class="text-sm leading-snug text-muted">{{ why }}</p>
      <div v-if="isNew || skillTitle" class="flex flex-wrap items-center gap-1.5">
        <span v-if="isNew" class="rounded-lg bg-primary-soft px-2 py-0.5 font-head text-xs font-extrabold text-accent-text">
          New
        </span>
        <NuxtLink
          v-if="skillTitle && skillTo"
          :to="skillTo"
          class="inline-flex min-h-11 items-center rounded-lg px-1 font-head text-xs font-extrabold text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          :aria-label="`Open skill ${skillTitle}`"
        >
          <span class="rounded-lg bg-surface-2 px-2 py-0.5 hover:text-ink">{{ skillTitle }}</span>
        </NuxtLink>
      </div>
    </template>
    <template v-if="showSave" #actions>
      <div class="flex">
        <FreshSaveButton :saved="saved" :title="video.title" @toggle="emit('toggleSave')" />
      </div>
    </template>
  </WatchVideoCard>
</template>
