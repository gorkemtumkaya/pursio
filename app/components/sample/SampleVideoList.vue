<script setup lang="ts">
import type { RankedVideo } from '#shared/types/video'
import { SAMPLE_COPY } from '~/utils/sample-copy'

/**
 * The videos of a sample skill (spec: sample-path, Requirement 8): the existing video card and
 * embedded player, as in the skill sheet's Watch section, but with no event recorder. Nothing
 * here records a play, progress or skip (Req 3.4, 8.4), and `skipped` is not listened to.
 * With no video, one line and no heading (Req 8.5).
 */
const props = defineProps<{ videos: readonly RankedVideo[]; activeId: string | null; headingId: string }>()
const emit = defineEmits<{ play: [id: string]; stop: [] }>()
</script>

<template>
  <section v-if="props.videos.length > 0" :aria-labelledby="headingId" class="flex flex-col gap-2">
    <h3 :id="headingId" class="font-head text-[13px] font-extrabold tracking-wider text-muted">
      {{ SAMPLE_COPY.videosHeading }}
    </h3>
    <!-- The reused card and player buttons get the pointer from here (Req 14.4). -->
    <ul class="flex flex-col gap-3 [&_button]:cursor-pointer">
      <li v-for="video in props.videos" :key="video.id">
        <WatchVideoCard :video="video" language="en" :active="video.id === activeId" layout="list" @play="emit('play', video.id)">
          <template #player>
            <WatchEmbedPlayer :key="video.id" :video-id="video.id" :title="video.title" />
            <button
              type="button"
              class="min-h-11 self-end rounded-xl border-2 border-line px-3 text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              @click="emit('stop')"
            >
              Close video
            </button>
          </template>
        </WatchVideoCard>
      </li>
    </ul>
  </section>
  <p v-else class="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm font-bold text-muted">{{ SAMPLE_COPY.noVideos }}</p>
</template>
