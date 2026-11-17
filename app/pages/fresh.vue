<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import type { VideoEvent } from '#shared/types/video'
import { buildFreshView, type ChipView, type FilterChip } from '#shared/utils/fresh-view'
import { emptyProgress } from '#shared/utils/progress-engine'
import { loadSkillTree } from '#shared/utils/skill-tree-load'
import sample from '~~/data/sample-bouldering.json'
import { createFreshActions, type FreshShownVideo } from '~/utils/fresh-actions'
import { buildFreshRequest, type FreshRequestSource } from '~/utils/fresh-request'
import {
  freshPageState,
  newTodayText,
  nextOpenGroups,
  pathLink,
  skillLink,
  toggleGroup,
  updatedLabel,
} from '~/utils/fresh-page'
import { HOBBY_LIBRARY_KEY, hobbyProgressKey, parseHobbyLibrary, type HobbyLibrary } from '~/utils/hobby-store'
import { browserStorage, createProgressStore, progressStorageKey } from '~/utils/progress-store'
import { effectiveLanguage, loadUserSettings } from '~/utils/user-settings'

/**
 * Fresh_Page (spec: fresh-v2, Req 1 to 11; `fresh` Req 8.15, 17). Top to bottom: header,
 * chips, the quiet or empty line, the Hero_Card and one Hobby_Section per path (or the
 * "Saved" grid); the Sources_Panel sits in the right column from `lg` and in a sheet below.
 * One Fresh_Endpoint request; chips and mutes only recompute `buildFreshView`, so they send
 * no new request (Req 2.5, 8.6). One video plays at a time, and scrolling a card out of view
 * in its carousel does not stop it (Req 7.2). Plays, progress, saves and skips go to
 * `useVideoEvents` with Source `feed` and never to the progress engine.
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

/** The page opens with "All hobbies" (Req 2.5). */
const chip = shallowRef<FilterChip>({ kind: 'all' })

const view = computed(() => {
  const data = response.value
  if (!data) return null
  return buildFreshView({
    response: data,
    chip: chip.value,
    mutes: muteMap.value,
    events: events.value,
    demo: isDemo,
  })
})

const updatedText = computed(() => updatedLabel(view.value?.updatedMs ?? null, fresh.nowMs.value))
const newToday = computed(() => (view.value?.newToday ? newTodayText(view.value.newToday) : null))
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
  for (const section of v.sections) for (const c of section.cards) ids.add(c.card.videoId)
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

/**
 * Open groups of the Sources_Panel accordion, shared by the desktop panel and the mobile
 * sheet (Req 8.3, 8.4). When the page opens or a chip is selected, the chip's group (else
 * the first one) opens; groups the user opened or closed by hand keep their state.
 */
const openSources = ref<ReadonlySet<string>>(new Set<string>())

function openDefaultSource(): void {
  openSources.value = nextOpenGroups(openSources.value, view.value?.defaultOpenSource ?? null)
}

watch(
  () => view.value !== null,
  (ready) => {
    if (ready) openDefaultSource()
  },
  { immediate: true },
)

function toggleSource(key: string): void {
  openSources.value = toggleGroup(openSources.value, key, view.value?.sources ?? [])
}

function selectChip(next: ChipView): void {
  chip.value = next.chip
  openDefaultSource()
}

function onMute(channelId: string, muted: boolean): void {
  mutes?.setMuted(channelId, muted)
}

/** The Path page with the Skill_Sheet open (Req 7.4); `/path?demo=1` in Demo_Mode. */
function skillTo(pathId: string, skillId: string): string | null {
  return skillLink(response.value?.paths ?? [], pathId, skillId, isDemo)
}

/** The Path page of a hobby, which makes it the active hobby (Req 4.7); `/path?demo=1` in Demo_Mode. */
function pathTo(pathId: string): string | null {
  return pathLink(response.value?.paths ?? [], pathId, isDemo)
}

const cardLanguage = computed(() => response.value?.language ?? 'en')

// Mobile Sources sheet (Req 8.8): focus returns to the "Sources" button on close.
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
    <!-- Same centered container as Quests and Profile (max-w-360); main and Sources share it on desktop. -->
    <div class="mx-auto w-full max-w-360 min-w-0 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 lg:px-8 lg:pt-7">
      <main class="mx-auto flex w-full max-w-240 min-w-0 flex-col gap-4 px-4 pt-5 pb-26 lg:max-w-none lg:gap-5 lg:px-0 lg:pt-0 lg:pb-12">
        <FreshHeader
          ref="header"
          :updated="updatedText"
          :new-today="page.kind === 'content' || page.kind === 'empty' ? newToday : null"
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

            <FreshHobbySection
              v-for="section in page.sections ? view.sections : []"
              :key="section.pathId"
              :section="section"
              :path-to="pathTo(section.pathId)"
              :language="cardLanguage"
              :active-video-id="actions.activeVideoId.value"
              :show-save="!isDemo"
              :is-saved="actions.isSaved"
              :skill-to="skillTo"
              @play="(entry) => actions.play(entry.card.videoId)"
              @stop="actions.stop()"
              @playing="(entry) => actions.onPlaying(shownVideo(entry.card))"
              @progress="(entry, s) => actions.onProgress(shownVideo(entry.card), s)"
              @toggle-save="(entry) => actions.toggleSave(shownVideo(entry.card))"
              @skipped="(entry) => actions.onSkipped(entry.card.videoId)"
            />
          </template>
        </template>
      </main>

      <aside v-if="view && page.sources" class="sticky top-7 hidden lg:block" aria-label="Sources">
        <FreshSourcesPanel
          heading-id="fresh-sources-heading"
          :groups="view.sources"
          :open="openSources"
          :demo="isDemo"
          @mute="onMute"
          @toggle="toggleSource"
        />
      </aside>
    </div>

    <FreshSourcesSheet
      v-if="view && page.sources"
      :open="sourcesOpen"
      :groups="view.sources"
      :open-groups="openSources"
      :demo="isDemo"
      @close="closeSources"
      @mute="onMute"
      @toggle="toggleSource"
    />
  </AppShell>
</template>
