<script setup lang="ts">
import { computed } from 'vue'
import type { HeroView } from '#shared/utils/fresh-view'
import { formatDuration } from '#shared/utils/watch-how'
import { isAllowedThumbnail } from '#shared/utils/fresh-view'

/**
 * Hero_Card (spec: fresh-v2, Req 3.2, 3.3, 3.8): the badge ("New today", "New this week" or
 * "Best for your current skill"), a tag with the hobby's avatar, the hobby, the matched skill
 * and "your current skill" when it is one, the thumbnail with a duration badge, the title,
 * the channel name, the Why_Line (Fresh_Item only), "Watch" and, outside Demo_Mode, "Save".
 * "Watch" replaces the thumbnail with the Embed_Player in place. The tag takes its colors
 * from the path's Color_Slot. Two columns from `lg`, stacked below. No XP is shown.
 */
const props = defineProps<{
  hero: HeroView
  /** The user's Language_Code. */
  language: string
  active: boolean
  /** False in Demo_Mode (decision D13). */
  showSave: boolean
  saved: boolean
  skillTo: string | null
}>()

const emit = defineEmits<{
  play: []
  stop: []
  toggleSave: []
  playing: []
  progress: [seconds: number]
}>()

const card = computed(() => props.hero.card)
const duration = computed(() => formatDuration(card.value.durationSeconds))
const thumbnail = computed(() => (isAllowedThumbnail(card.value.thumbnailUrl) ? card.value.thumbnailUrl : null))
const why = computed(() => (props.hero.kind === 'fresh' ? props.hero.card.why : null))
const poolLabel = computed(() =>
  card.value.poolLanguage !== props.language ? card.value.poolLanguage.toUpperCase() : null,
)
const headingId = computed(() => `fresh-hero-${card.value.videoId}`)

const BADGES = {
  today: 'New today',
  week: 'New this week',
  best: 'Best for your current skill',
} as const
const badge = computed(() => BADGES[props.hero.badge])
</script>

<template>
  <article
    :aria-labelledby="headingId"
    class="overflow-hidden rounded-3xl border-2 border-line bg-surface shadow-raised-line lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
  >
    <div class="relative">
      <div v-if="active" class="p-2">
        <WatchEmbedPlayer
          :key="card.videoId"
          :video-id="card.videoId"
          :title="card.title"
          @playing="emit('playing')"
          @progress="(seconds) => emit('progress', seconds)"
        />
      </div>
      <button
        v-else
        type="button"
        class="relative block aspect-video size-full overflow-hidden bg-primary-soft focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink"
        :aria-label="`Play ${card.title}, ${card.channel}, ${duration}`"
        @click="emit('play')"
      >
        <img v-if="thumbnail" :src="thumbnail" alt="" class="size-full object-cover" />
        <span class="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span class="flex size-16 items-center justify-center rounded-full bg-primary text-primary-ink shadow-raised-primary">
            <PathIcon name="play" class="size-7" />
          </span>
        </span>
        <span class="absolute right-3 bottom-3 rounded-lg bg-ink px-1.5 py-0.5 text-xs font-extrabold text-surface" aria-hidden="true">
          {{ duration }}
        </span>
      </button>
      <span
        v-if="!active"
        class="pointer-events-none absolute top-3 left-3 rounded-lg bg-surface px-2 py-0.5 font-head text-xs font-extrabold tracking-wider text-accent-text uppercase"
      >
        {{ badge }}
      </span>
    </div>

    <div class="flex flex-col gap-2.5 p-4 lg:p-6">
      <p v-if="active" class="font-head text-xs font-extrabold tracking-wider text-accent-text uppercase">{{ badge }}</p>
      <p
        :data-hobby-slot="hero.path.colorSlot"
        class="flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 self-start rounded-2xl bg-hobby py-1 pr-3 pl-1 text-[13px] font-bold text-ink"
      >
        <FreshHobbyAvatar :letter="hero.path.letter" size="small" />
        <span>{{ hero.path.hobby }}</span>
        <template v-if="hero.skillTitle">
          <span aria-hidden="true">·</span>
          <NuxtLink
            v-if="skillTo"
            :to="skillTo"
            :aria-label="`Open skill ${hero.skillTitle}`"
            class="rounded-md font-extrabold text-hobby-deep underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {{ hero.skillTitle }}
          </NuxtLink>
          <span v-else class="font-extrabold text-hobby-deep">{{ hero.skillTitle }}</span>
        </template>
        <template v-if="hero.isCurrentSkill">
          <span aria-hidden="true">·</span>
          <span class="text-muted">your current skill</span>
        </template>
      </p>
      <p class="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-muted">
        <span>{{ card.channel }}</span>
        <span
          v-if="poolLabel"
          class="rounded-full border-2 border-line px-2 py-0.5 text-xs font-extrabold text-muted"
        >
          {{ poolLabel }}
        </span>
      </p>
      <h2 :id="headingId" class="font-display text-2xl leading-tight text-ink lg:text-[28px]">{{ card.title }}</h2>
      <p v-if="why" class="text-[15px] leading-relaxed text-muted">{{ why }}</p>
      <div class="mt-auto flex items-center gap-3 pt-1">
        <button
          v-if="!active"
          type="button"
          class="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 font-head text-[15px] font-extrabold text-primary-ink shadow-raised-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-0.5 lg:flex-none"
          :aria-label="`Watch ${card.title}`"
          @click="emit('play')"
        >
          <PathIcon name="play" class="size-4.5" />
          <span>Watch</span>
        </button>
        <button
          v-else
          type="button"
          class="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-line px-5 font-head text-[15px] font-extrabold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          @click="emit('stop')"
        >
          Close video
        </button>
        <FreshSaveButton v-if="showSave" :saved="saved" :title="card.title" size="large" @toggle="emit('toggleSave')" />
      </div>
    </div>
  </article>
</template>
