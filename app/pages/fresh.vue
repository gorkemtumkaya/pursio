<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import type { VideoEvent } from '#shared/types/video'
import { buildFreshView, type ChipView, type FilterChip } from '#shared/utils/fresh-view'
import { emptyProgress } from '#shared/utils/progress-engine'
import { loadSkillTree } from '#shared/utils/skill-tree-load'
import sample from '~~/data/sample-bouldering.json'
import { getActiveHobbyId } from '~/utils/active-hobby'
import { createFreshActions, type FreshShownVideo } from '~/utils/fresh-actions'
import { buildFreshRequest, type FreshRequestSource } from '~/utils/fresh-request'
import { freshPageState, skillLink, updatedLabel } from '~/utils/fresh-page'
import { HOBBY_LIBRARY_KEY, hobbyProgressKey, parseHobbyLibrary, type HobbyLibrary } from '~/utils/hobby-store'
import { browserStorage, createProgressStore, progressStorageKey } from '~/utils/progress-store'
import { effectiveLanguage, loadUserSettings } from '~/utils/user-settings'

/**
 * Fresh_Page (spec: fresh, Req 8.15, 11 to 17). One Fresh_Endpoint request; chips and mutes
 * only recompute `buildFreshView`, so they send no new request (Req 14.8, 15.6). One video
 * plays at a time. Plays, progress, saves and skips go to `useVideoEvents` with Source `feed`
 * and never to the progress engine (Req 17.7).
 *
 * `?demo=1` (decision D13): the request holds the Demo_Paths and no token, and nothing is
 * written: no recorder, no mute store, no switch, save control or "Saved" chip.
 */

// Remount when only the query changes, so switching to and from ?demo=1 starts over.
definePageMeta({ key: (route) => route.fullPath })

useHead({ title: 'Fresh · Pursio' })

const route = useRoute()
const isDemo = route.query.demo === '1'

const sampleLoaded = isDemo ? loadSkillTree(sample) : null
const demoTree = sampleLoaded?.ok ? sampleLoaded.value : null
/** Request path id of the Demo_Path. */
const DEMO_PATH_ID = 'demo'

const auth = isDemo ? null : useAuth()
const cloud = isDemo ? null : useCloudStore()
const recorder = isDemo ? null : useVideoEvents()
const mutes = isDemo ? null : useChannelMutes()

/** The account's language wins over the browser copy; default `en`. */
function language(): string | null {
  const stored = cloud?.profile.value?.language ?? null
  if (stored !== null && stored.trim() !== '') return stored
  return effectiveLanguage(loadUserSettings(browserStorage))
}

/** The local Hobby_Library, read without migrating or writing anything. */
function localLibrary(): HobbyLibrary {
  let raw: string | null = null
  try {
    raw = browserStorage()?.getItem(HOBBY_LIBRARY_KEY) ?? null
  } catch {
    raw = null
  }
  return parseHobbyLibrary(raw).library
}

function requestSource(): FreshRequestSource {
  if (isDemo) {
    const tree = demoTree
    if (!tree) throw new Error('sample tree missing')
    return {
      kind: 'demo',
      id: DEMO_PATH_ID,
      tree,
      // Reading the demo Progress writes nothing (Req 17.9).
      progress: () => createProgressStore(browserStorage, tree, progressStorageKey(tree.hobby)).load(),
      language,
    }
  }
  return {
    kind: 'account',
    token: () => auth?.accessToken() ?? Promise.resolve(null),
    library: localLibrary,
    progressOf: (hobby) => {
      try {
        return createProgressStore(browserStorage, hobby.tree, hobbyProgressKey(hobby.id)).load()
      } catch {
        return emptyProgress()
      }
    },
    language,
  }
}

const fresh = useFresh({ request: () => buildFreshRequest(requestSource()) })
const response = computed(() => (fresh.status.value === 'ready' ? fresh.response.value : null))

// Non-demo pages wait until the session started (or could not start), so the token is known.
const authSettled = computed(() => isDemo || (auth !== null && auth.status.value !== 'loading'))
let started = false
onMounted(() => {
  watch(
    authSettled,
    (settled) => {
      if (!settled || started) return
      started = true
      void fresh.start()
    },
    { immediate: true },
  )
})

// Cloud mutes come with the response; local ones are read once (Req 2.5, 2.9).
watch(response, (data) => {
  if (!data || !mutes) return
  mutes.load()
  mutes.setCloud(data.mutes)
})

const EMPTY_MUTES: ReadonlyMap<string, boolean> = new Map()
const EMPTY_EVENTS: readonly VideoEvent[] = []
const muteMap = computed(() => (mutes ? mutes.muted.value : EMPTY_MUTES))
const events = computed<readonly VideoEvent[]>(() => {
  const data = response.value
  if (!data || !recorder) return EMPTY_EVENTS
  return recorder.mergedEvents(data.events)
})

/** The stored Selected_Path: the Active_Hobby's path; Demo_Mode uses the first Demo_Path (Req 8.15, 12.4). */
const selectedPathId = shallowRef<string | null>(null)
watch(response, (data) => {
  if (!data || isDemo || !import.meta.client) return
  const active = getActiveHobbyId()
  selectedPathId.value = data.paths.find((p) => p.hobbyId === active || p.id === active)?.id ?? null
})

/** The page opens with "All skills" (decision D10). */
const chip = shallowRef<FilterChip>({ kind: 'all' })

const view = computed(() => {
  const data = response.value
  if (!data) return null
  return buildFreshView({
    response: data,
    chip: chip.value,
    selectedPathId: selectedPathId.value,
    mutes: muteMap.value,
    events: events.value,
    demo: isDemo,
  })
})


const updatedText = computed(() => updatedLabel(view.value?.updatedMs ?? null, fresh.nowMs.value))
const page = computed(() => freshPageState(fresh.status.value, view.value, response.value?.paths.length ?? 0))

/** Every video id shown under the chip and mutes, for skips and for stopping a hidden video. */
const shownIds = computed(() => {
  const v = view.value
  const ids = new Set<string>()
  if (!v) return ids
  if (v.chip.kind === 'saved') {
    for (const c of v.saved) ids.add(c.videoId)
    return ids
  }
  if (v.hero) ids.add(v.hero.card.videoId)
  for (const c of v.newCards) ids.add(c.card.videoId)
  for (const c of v.bestCards) ids.add(c.card.videoId)
  return ids
})

const actions = createFreshActions({
  demo: isDemo,
  recorder,
  events: () => events.value,
  shown: (id) => shownIds.value.has(id),
})

// A chip or mute change that hides the playing card stops it; its player flushes progress (Req 17.2).
watch(shownIds, () => actions.syncShown())

function selectChip(next: ChipView): void {
  chip.value = next.chip
}

function onMute(channelId: string, muted: boolean): void {
  mutes?.setMuted(channelId, muted)
}

/** The Path page with the Skill_Sheet open (Req 13.4); `/path?demo=1` in Demo_Mode. */
function skillTo(pathId: string, skillId: string): string | null {
  return skillLink(response.value?.paths ?? [], pathId, skillId, isDemo)
}

const cardLanguage = computed(() => response.value?.language ?? 'en')

// Mobile Sources sheet (Req 15.5): focus returns to the "Sources" button on close.
const sourcesOpen = ref(false)
interface HeaderHandle {
  focusSources(): void
}
const header = ref<HeaderHandle | null>(null)

function closeSources(): void {
  sourcesOpen.value = false
  void nextTick(() => header.value?.focusSources())
}

function shownVideo(video: FreshShownVideo): FreshShownVideo {
  return {
    videoId: video.videoId,
    title: video.title,
    channel: video.channel,
    channelId: video.channelId,
    thumbnailUrl: video.thumbnailUrl,
    durationSeconds: video.durationSeconds,
  }
}
</script>

<template>
  <AppShell>
    <div class="min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 lg:px-8 lg:pt-7">
      <main class="mx-auto flex w-full max-w-240 min-w-0 flex-col gap-4 px-4 pt-5 pb-26 lg:mx-0 lg:gap-5 lg:px-0 lg:pt-0 lg:pb-12">
        <FreshHeader
          ref="header"
          :filter-label="view?.headerLabel ?? ''"
          :updated="updatedText"
          :show-sources="page.sources"
          :sources-open="sourcesOpen"
          @open-sources="sourcesOpen = true"
        />

        <FreshState v-if="page.kind === 'loading'" kind="loading" />
        <FreshState
          v-else-if="page.kind === 'error'"
          kind="error"
          :pending="fresh.pending.value"
          @retry="fresh.retry()"
        />
        <FreshState v-else-if="page.kind === 'no_paths' || !view" kind="no_paths" />

        <template v-else>
          <FreshFilterChips v-if="page.chips" :chips="view.chips" @select="selectChip" />

          <template v-if="page.kind === 'saved' || page.kind === 'saved_empty'">
            <FreshState v-if="page.kind === 'saved_empty'" kind="saved_empty" />
            <FreshSection v-else heading="Saved">
              <li v-for="saved in view.saved" :key="saved.videoId">
                <FreshVideoCard
                  :video="saved.snapshot"
                  :pool-language="cardLanguage"
                  :language="cardLanguage"
                  :active="actions.activeVideoId.value === saved.videoId"
                  :show-save="!isDemo"
                  :saved="actions.isSaved(saved.videoId)"
                  @play="actions.play(saved.videoId)"
                  @stop="actions.stop()"
                  @playing="actions.onPlaying(saved.snapshot)"
                  @progress="(s) => actions.onProgress(saved.snapshot, s)"
                  @toggle-save="actions.toggleSave(saved.snapshot)"
                  @skipped="actions.onSkipped(saved.videoId)"
                />
              </li>
            </FreshSection>
          </template>

          <template v-else>
            <FreshState v-if="page.quietLine" kind="quiet" />
            <FreshState v-if="page.kind === 'empty'" kind="empty" />

            <FreshHeroCard
              v-if="page.hero && view.hero"
              :key="view.hero.card.videoId"
              :hero="view.hero"
              :language="cardLanguage"
              :active="actions.activeVideoId.value === view.hero.card.videoId"
              :show-save="!isDemo"
              :saved="actions.isSaved(view.hero.card.videoId)"
              :skill-to="skillTo(view.hero.match.pathId, view.hero.match.skillId)"
              @play="actions.play(view.hero.card.videoId)"
              @stop="actions.stop()"
              @playing="actions.onPlaying(shownVideo(view.hero.card))"
              @progress="(s) => view?.hero && actions.onProgress(shownVideo(view.hero.card), s)"
              @toggle-save="actions.toggleSave(shownVideo(view.hero.card))"
            />

            <FreshSection v-if="page.newSection" heading="New for your path">
              <li v-for="entry in view.newCards" :key="entry.card.videoId">
                <FreshVideoCard
                  :video="entry.card"
                  :pool-language="entry.card.poolLanguage"
                  :language="cardLanguage"
                  :active="actions.activeVideoId.value === entry.card.videoId"
                  :why="entry.card.why"
                  :is-new="entry.isNew"
                  :skill-title="entry.skillTitle"
                  :skill-to="skillTo(entry.match.pathId, entry.match.skillId)"
                  :show-save="!isDemo"
                  :saved="actions.isSaved(entry.card.videoId)"
                  @play="actions.play(entry.card.videoId)"
                  @stop="actions.stop()"
                  @playing="actions.onPlaying(shownVideo(entry.card))"
                  @progress="(s) => actions.onProgress(shownVideo(entry.card), s)"
                  @toggle-save="actions.toggleSave(shownVideo(entry.card))"
                  @skipped="actions.onSkipped(entry.card.videoId)"
                />
              </li>
            </FreshSection>

            <FreshSection v-if="page.bestSection" heading="Best for your current skills">
              <li v-for="entry in view.bestCards" :key="entry.card.videoId">
                <FreshVideoCard
                  :video="entry.card"
                  :pool-language="entry.card.poolLanguage"
                  :language="cardLanguage"
                  :active="actions.activeVideoId.value === entry.card.videoId"
                  :skill-title="entry.skillTitle"
                  :skill-to="skillTo(entry.match.pathId, entry.match.skillId)"
                  :show-save="!isDemo"
                  :saved="actions.isSaved(entry.card.videoId)"
                  @play="actions.play(entry.card.videoId)"
                  @stop="actions.stop()"
                  @playing="actions.onPlaying(shownVideo(entry.card))"
                  @progress="(s) => actions.onProgress(shownVideo(entry.card), s)"
                  @toggle-save="actions.toggleSave(shownVideo(entry.card))"
                  @skipped="actions.onSkipped(entry.card.videoId)"
                />
              </li>
            </FreshSection>
          </template>
        </template>
      </main>

      <aside v-if="view && page.sources" class="sticky top-7 hidden lg:block" aria-label="Sources">
        <FreshSourcesPanel heading-id="fresh-sources-heading" :groups="view.sources" :demo="isDemo" @mute="onMute" />
      </aside>
    </div>

    <FreshSourcesSheet
      v-if="view && page.sources"
      :open="sourcesOpen"
      :groups="view.sources"
      :demo="isDemo"
      @close="closeSources"
      @mute="onMute"
    />
  </AppShell>
</template>
