<script setup lang="ts">
import { computed, useId } from 'vue'
import type { RankedVideo } from '#shared/types/video'
import { topCards } from '#shared/utils/watch-how'

/**
 * The "Watch" section of the skill sheet (spec: skill-video-pipeline, Req 12.1, 12.7 to 12.9, 12.12).
 * Shows the top 3 videos, or the finding line while a fill runs. An active video outside
 * the top 3 (from a "Watch how" link) plays above the cards. Plays, progress and skips go to
 * the event recorder and never touch XP, level or streak (Req 12.13).
 */
const props = defineProps<{
  videos: readonly RankedVideo[]
  /** The user's Language_Code. */
  language: string
  finding: boolean
  activeId: string | null
}>()

const emit = defineEmits<{ play: [id: string]; stop: [] }>()

const headingId = `watch-heading-${useId()}`
const recorder = useVideoEvents()

const cards = computed(() => topCards(props.videos))
const active = computed(() => props.videos.find((video) => video.id === props.activeId) ?? null)
const extraActive = computed(() =>
  active.value && !cards.value.some((video) => video.id === active.value?.id) ? active.value : null,
)
const visible = computed(() => props.finding || props.videos.length > 0)
</script>

<template>
  <section v-if="visible" :aria-labelledby="headingId" class="flex flex-col gap-2">
    <h3 :id="headingId" class="font-head text-[13px] font-extrabold tracking-wider text-muted">WATCH</h3>

    <p v-if="finding && videos.length === 0" class="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm font-bold text-muted" role="status">
      Finding videos for this skill
    </p>

    <template v-else>
      <div v-if="extraActive" class="flex flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-2">
        <WatchEmbedPlayer
          :key="extraActive.id"
          :video-id="extraActive.id"
          :title="extraActive.title"
          @playing="recorder.recordPlay(extraActive.id)"
          @progress="(seconds) => recorder.recordProgress(extraActive!.id, seconds, extraActive!.durationSeconds)"
        />
        <div class="flex items-center justify-between gap-2 px-1 pb-1">
          <span class="min-w-0 flex-1 text-[15px] leading-snug font-bold text-ink">{{ extraActive.title }}</span>
          <button
            type="button"
            class="min-h-11 shrink-0 rounded-xl border-2 border-line px-3 text-sm font-bold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            @click="emit('stop')"
          >
            Close video
          </button>
        </div>
      </div>

      <ul class="flex flex-col gap-3">
        <li v-for="video in cards" :key="video.id">
          <WatchVideoCard
            :video="video"
            :language="language"
            :active="video.id === activeId"
            @play="emit('play', video.id)"
            @skipped="recorder.recordSkip(video.id)"
          >
            <template #player>
              <WatchEmbedPlayer
                :key="video.id"
                :video-id="video.id"
                :title="video.title"
                @playing="recorder.recordPlay(video.id)"
                @progress="(seconds) => recorder.recordProgress(video.id, seconds, video.durationSeconds)"
              />
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
    </template>
  </section>
</template>
