<script setup lang="ts">
import { computed } from 'vue'
import type { RankedVideo } from '#shared/types/video'
import { isAllowedThumbnail, type SkillTagKind } from '#shared/utils/fresh-view'
import type { FreshShownVideo } from '~/utils/fresh-actions'

/**
 * One card of a Hobby_Section carousel or the "Saved" view (spec: fresh-v2, Req 5.2 to 5.4,
 * 5.7, 6.6, 7.1, 7.3; `fresh` Req 18.3). It wraps `WatchVideoCard`, always with the thumbnail
 * on top, and adds the "New" badge on the thumbnail, the Why_Line (Fresh_Items only), the
 * skill tag and the save control. The tag's dot takes the hobby color of the nearest
 * `data-hobby-slot` ancestor. A thumbnail renders only from `i.ytimg.com`, and lazily; any
 * other URL shows the neutral block. No XP is shown.
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
  /** `next` reads "Next: <skill>" (Req 5.4). */
  tag?: SkillTagKind
  /** Path page with the Skill_Sheet open. */
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

const tagText = computed(() => {
  if (!props.skillTitle) return null
  return props.tag === 'next' ? `Next: ${props.skillTitle}` : props.skillTitle
})
</script>

<template>
  <div class="relative h-full">
    <WatchVideoCard
      class="h-full"
      :video="ranked"
      :language="language"
      :active="active"
      layout="stack"
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
        <div class="flex justify-end px-1">
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
        <div v-if="tagText || showSave" class="mt-auto flex items-center justify-between gap-2">
          <NuxtLink
            v-if="tagText && skillTo"
            :to="skillTo"
            class="group/tag inline-flex min-h-11 min-w-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            :aria-label="`Open skill ${skillTitle}`"
          >
            <span class="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 font-head text-xs font-extrabold text-muted group-hover/tag:text-ink">
              <span class="size-2 shrink-0 rounded-full bg-hobby-deep" aria-hidden="true" />
              <span class="truncate">{{ tagText }}</span>
            </span>
          </NuxtLink>
          <span
            v-else-if="tagText"
            class="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 font-head text-xs font-extrabold text-muted"
          >
            <span class="size-2 shrink-0 rounded-full bg-hobby-deep" aria-hidden="true" />
            <span class="truncate">{{ tagText }}</span>
          </span>
          <span v-else />
          <FreshSaveButton v-if="showSave" :saved="saved" :title="video.title" size="icon" @toggle="emit('toggleSave')" />
        </div>
      </template>
    </WatchVideoCard>
    <span
      v-if="isNew && !active"
      class="pointer-events-none absolute top-4 left-4 rounded-lg bg-primary px-2 py-0.5 font-head text-xs font-extrabold text-primary-ink"
    >
      New
    </span>
  </div>
</template>
