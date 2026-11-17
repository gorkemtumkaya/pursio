<script setup lang="ts">
import { useId } from 'vue'
import type { HobbySectionView, SectionCardView } from '#shared/utils/fresh-view'

/**
 * The section of one hobby (spec: fresh-v2, Req 4, 11.2). It is tinted with the path's
 * Color_Slot (`data-hobby-slot`), and everything inside reads the slot's colors.
 *
 * Header: avatar, hobby, the subtitle and the "n new" badge. From `lg` up the subtitle is
 * "You're on <skill> · <completed> of <total> done" and an "Open path" button shows; below
 * `lg` it is "On <skill>" and the avatar and name are one link with a chevron (Req 4.3, 4.7).
 * Body: the carousel of cards, or one line for a finished path or a hobby with no videos
 * (Req 4.8, 4.9).
 *
 * The heading is rendered once, for assistive technology and to label the carousel
 * (Req 4.5); the two visible copies of the name are a link (below `lg`) or hidden from the
 * accessibility tree (from `lg`), so the hobby is announced once.
 */
defineProps<{
  section: HobbySectionView
  /** The Path page of this hobby; `/path?demo=1` in Demo_Mode. */
  pathTo: string | null
  /** The user's Language_Code. */
  language: string
  activeVideoId: string | null
  /** False in Demo_Mode. */
  showSave: boolean
  isSaved: (videoId: string) => boolean
  skillTo: (pathId: string, skillId: string) => string | null
}>()

const emit = defineEmits<{
  play: [entry: SectionCardView]
  stop: []
  playing: [entry: SectionCardView]
  progress: [entry: SectionCardView, seconds: number]
  toggleSave: [entry: SectionCardView]
  skipped: [entry: SectionCardView]
}>()

const headingId = `fresh-hobby-${useId()}`

function cardKey(entry: SectionCardView): string {
  return entry.card.videoId
}
</script>

<template>
  <section
    :data-hobby-slot="section.colorSlot"
    :aria-labelledby="headingId"
    class="flex min-w-0 flex-col gap-3 rounded-3xl bg-hobby p-4 lg:p-5"
  >
    <h2 :id="headingId" class="sr-only">{{ section.hobby }}</h2>

    <div class="flex flex-col gap-1">
      <div class="flex items-center gap-3">
        <!-- Below lg: the avatar and name are the path link (Req 4.7). -->
        <NuxtLink
          v-if="pathTo"
          :to="pathTo"
          :aria-label="`Open ${section.hobby} path`"
          class="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:hidden"
        >
          <FreshHobbyAvatar :letter="section.letter" />
          <span class="truncate font-display text-xl leading-tight text-ink">{{ section.hobby }}</span>
          <PathIcon name="chevron" class="size-5 shrink-0 -rotate-90 text-hobby-deep" />
        </NuxtLink>
        <div v-else class="flex min-h-11 min-w-0 flex-1 items-center gap-3 lg:hidden" aria-hidden="true">
          <FreshHobbyAvatar :letter="section.letter" />
          <span class="truncate font-display text-xl leading-tight text-ink">{{ section.hobby }}</span>
        </div>

        <!-- From lg: avatar, name and the long subtitle. -->
        <div class="hidden min-w-0 flex-1 items-center gap-3 lg:flex">
          <FreshHobbyAvatar :letter="section.letter" />
          <div class="flex min-w-0 flex-col">
            <span class="truncate font-display text-2xl leading-tight text-ink" aria-hidden="true">{{ section.hobby }}</span>
            <p v-if="section.state === 'finished'" class="text-sm font-semibold text-muted">Path finished</p>
            <p v-else class="text-sm font-semibold text-muted">
              You're on <span class="font-extrabold text-hobby-deep">{{ section.currentSkillTitle }}</span>
              <span aria-hidden="true"> · </span>
              <span>{{ section.completedCount }} of {{ section.totalCount }} done</span>
            </p>
          </div>
        </div>

        <span
          v-if="section.newCount > 0 && section.state !== 'finished'"
          class="shrink-0 rounded-full bg-primary px-2.5 py-1 font-head text-xs font-extrabold whitespace-nowrap text-primary-ink"
        >
          {{ section.newCount }} new
        </span>

        <NuxtLink
          v-if="pathTo"
          :to="pathTo"
          class="hidden min-h-11 shrink-0 items-center rounded-xl border-2 border-line bg-surface px-4 font-head text-sm font-extrabold text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:inline-flex"
        >
          Open path<span class="sr-only">, {{ section.hobby }}</span>
        </NuxtLink>
      </div>

      <!-- Below lg: the short subtitle (AS1). -->
      <p v-if="section.state === 'finished'" class="text-sm font-semibold text-muted lg:hidden">Path finished</p>
      <p v-else class="text-sm font-semibold text-muted lg:hidden">
        On <span class="font-extrabold text-hobby-deep">{{ section.currentSkillTitle }}</span>
      </p>
    </div>

    <p v-if="section.state === 'empty'" class="text-sm font-semibold text-muted">No videos yet</p>

    <FreshCarousel
      v-else-if="section.state === 'cards'"
      :items="section.cards"
      :item-key="cardKey"
      :label="section.hobby"
      :labelled-by="headingId"
    >
      <template #default="{ item }">
        <FreshVideoCard
          :video="item.card"
          :pool-language="item.card.poolLanguage"
          :language="language"
          :active="activeVideoId === item.card.videoId"
          :why="item.kind === 'fresh' ? item.card.why : null"
          :is-new="item.kind === 'fresh' && item.isNew"
          :skill-title="item.skillTitle"
          :tag="item.tag"
          :skill-to="skillTo(item.match.pathId, item.match.skillId)"
          :show-save="showSave"
          :saved="isSaved(item.card.videoId)"
          @play="emit('play', item)"
          @stop="emit('stop')"
          @playing="emit('playing', item)"
          @progress="(seconds) => emit('progress', item, seconds)"
          @toggle-save="emit('toggleSave', item)"
          @skipped="emit('skipped', item)"
        />
      </template>
    </FreshCarousel>
  </section>
</template>
