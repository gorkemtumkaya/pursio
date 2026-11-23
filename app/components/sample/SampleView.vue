<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import type { SamplePath } from '#shared/types/sample-path'
import { deriveNodeStates, emptyProgress } from '#shared/utils/progress-engine'
import { sampleToTree } from '#shared/utils/sample-path'
import { usePathLayout } from '~/composables/usePathLayout'
import { useViewportClass } from '~/composables/useViewportClass'
import { track } from '~/utils/analytics'
import { SAMPLE_COPY } from '~/utils/sample-copy'
import { createSampleTracker, utmProps, type MineSource } from '~/utils/sample-events'
import { handoffTarget, setSampleHandoff } from '~/utils/sample-handoff'
import { canvasPreview, finishView, firstSkillId, previewModel } from '~/utils/sample-view'

/**
 * The sample path page (spec: sample-path, Requirements 4 to 9). It draws a static Sample with
 * the path screen's own components in Preview_Mode. It holds no Progress and reads no session,
 * account or API: nothing here costs anything before the visitor asks for a path (Requirement 3).
 */
const props = defineProps<{ sample: SamplePath }>()

// The Sample is static for the life of the page, so the tree and its texts are made once.
const tree = sampleToTree(props.sample)
const progress = emptyProgress()
const states = deriveNodeStates(tree, progress)
const preview = canvasPreview(props.sample)
const finish = finishView(props.sample)
const noAnimation: ReadonlySet<string> = new Set()
const placeholder = SAMPLE_COPY.placeholder(props.sample.slug)

const viewport = useViewportClass()
const { status, layout } = usePathLayout(tree, viewport)

const route = useRoute()
/** The four events, with the hobby and the utm of the landing URL (Requirement 11). */
const tracker = createSampleTracker(track, { hobby: props.sample.slug, ...utmProps(route.query) })
// After mount, so the prerender at build time sends nothing (Req 11.3).
onMounted(() => tracker.viewed())

/** Selected skill: the first one until the visitor picks another (Req 7.1). Kept across viewports (Req 7.9). */
const selectedId = ref<string | null>(firstSkillId(props.sample))
const ready = computed(() => status.value === 'ready' && layout.value !== null)
const selected = computed(() => (selectedId.value === null ? null : previewModel(props.sample, selectedId.value)))

/** The video playing in the preview; at most one (Req 8.3). */
const activeVideoId = ref<string | null>(null)

/** The note: one value for the desktop box and the mobile sheet (Req 9.7). Memory only, never stored. */
const note = ref('')

/** Mobile skill sheet, and the skill whose node opened it, for focus return (Req 7.3, 7.7). */
const skillSheetOpen = ref(false)
const openerId = ref<string | null>(null)
const canvas = useTemplateRef<{ focusNode: (id: string) => void }>('canvas')

/** Mobile Make it yours sheet, and where focus goes back when it closes (Req 9.6). */
const mineSheetOpen = ref(false)
type FocusReturn = { kind: 'element'; el: HTMLElement } | { kind: 'node'; id: string } | null
let mineReturn: FocusReturn = null

const mineBox = useTemplateRef<{ focusNote: () => void }>('mineBox')

/** Desktop: a click selects (Req 7.2). Mobile: a tap opens the sheet (Req 7.3). */
function onSelect(id: string): void {
  if (viewport.value === 'mobile') {
    selectedId.value = id
    activeVideoId.value = null
    openerId.value = id
    skillSheetOpen.value = true
    tracker.skillOpened(id)
    return
  }
  if (id === selectedId.value) return
  selectedId.value = id
  activeVideoId.value = null
  tracker.skillOpened(id)
}

function focusNodeLater(id: string): void {
  void nextTick(() => canvas.value?.focusNode(id))
}

function closeSkillSheet(): void {
  skillSheetOpen.value = false
  activeVideoId.value = null
  if (openerId.value !== null) focusNodeLater(openerId.value)
}

/** The bar's button opens the sheet (Req 9.4). */
function openMineFromBar(opener: HTMLElement): void {
  mineReturn = { kind: 'element', el: opener }
  mineSheetOpen.value = true
  mineOpened('bar')
}

function mineOpened(source: MineSource): void {
  tracker.mineOpened(source)
}

/** "Make this path mine" at the end of the skill sheet swaps the sheets (Req 7.8). */
function openMineFromSkill(): void {
  skillSheetOpen.value = false
  activeVideoId.value = null
  mineReturn = openerId.value === null ? null : { kind: 'node', id: openerId.value }
  mineSheetOpen.value = true
  mineOpened('skill_sheet')
}

function closeMineSheet(): void {
  mineSheetOpen.value = false
  const target = mineReturn
  mineReturn = null
  if (target?.kind === 'node') focusNodeLater(target.id)
  else if (target?.kind === 'element') void nextTick(() => target.el.focus())
}

/** "Build my own path" in the desktop top bar (Req 4.3). */
function focusNote(): void {
  mineOpened('top_bar')
  mineBox.value?.focusNote()
}

/** True from the first build press on, so a second press does nothing (Req 10.7). */
let leaving = false

/**
 * "Build my path" and "Skip" (Requirement 10): the hobby and the note go to `/new` through memory,
 * the hobby and the campaign params through the URL. From there the new hobby flow takes over.
 */
async function build(skipped: boolean): Promise<void> {
  if (leaving) return
  leaving = true
  const text = skipped ? '' : note.value.trim()
  tracker.buildClicked({ hasNote: text !== '', skipped })
  setSampleHandoff(props.sample.hobby, text)
  try {
    const result = await navigateTo(handoffTarget(props.sample.hobby, route.query))
    // A refused navigation leaves the visitor here: let the button work again.
    if (result === false || result instanceof Error) leaving = false
  } catch {
    leaving = false
  }
}

// Each layout shows its own way in; a change of viewport opens nothing (Req 7.9, 9.7).
watch(viewport, (next) => {
  if (next !== 'mobile') {
    skillSheetOpen.value = false
    mineSheetOpen.value = false
  }
})
</script>

<template>
  <div>
    <SampleTopBar @build-own="focusNote" />

    <div class="mx-auto w-full max-w-[1048px] lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(360px,32vw,420px)] lg:gap-9 lg:px-4">
      <main class="mx-auto w-full min-w-0 max-w-160 pt-5 lg:pt-7">
        <div class="px-4 lg:px-0">
          <SampleIntroCard :sample="sample" />
        </div>

        <!-- pb-28 on phones keeps the finish line card above the sticky bar (Req 9.5). -->
        <div class="pt-6" :class="{ 'pb-28 lg:pb-10': ready }">
          <PathCanvas
            v-if="ready && layout"
            ref="canvas"
            :tree="tree"
            :layout="layout"
            :states="states"
            :progress="progress"
            :active-section="0"
            :selected-id="selectedId"
            :show-selection="viewport === 'desktop'"
            :animating="noAnimation"
            :preview="preview"
            @select="onSelect"
          />
          <div v-else class="pb-20 lg:pb-0">
            <PathStatus
              :state="status === 'error' ? 'error' : 'loading'"
              :message="status === 'error' ? SAMPLE_COPY.drawFailed : SAMPLE_COPY.loading"
            />
          </div>
          <PathFinishLine v-if="ready" :view="finish" plain class="px-4 pt-6 pb-1.5 lg:px-0" />
        </div>
      </main>

      <!--
        Right column (desktop). Sticky, and one screen minus the 82 px top bar tall, so at the top of
        the page the whole column is in view. The preview scrolls inside it; Make it yours and the
        founding line never move out of view (Req 9.3). The path screen's side panel is one full
        screen tall because that screen has no top bar, so it is not reused here.
      -->
      <aside
        v-if="viewport === 'desktop'"
        aria-label="Skill preview and Make it yours"
        class="sticky top-0 hidden h-[calc(100dvh-82px)] flex-col gap-5 pt-7 pb-6 lg:flex"
      >
        <div class="min-h-0 shrink overflow-y-auto pb-2">
          <SampleSkillPreview
            v-if="selected"
            :model="selected"
            layout="panel"
            :active-video-id="activeVideoId"
            @play="activeVideoId = $event"
            @stop="activeVideoId = null"
          />
        </div>
        <div class="flex shrink-0 flex-col gap-1">
          <SampleMineBox
            ref="mineBox"
            v-model="note"
            :placeholder="placeholder"
            layout="panel"
            @build="build(false)"
            @note-focus="mineOpened('note_focus')"
          />
          <SampleFoundingLine />
        </div>
      </aside>
    </div>

    <template v-if="viewport === 'mobile'">
      <SampleMineBar @open="openMineFromBar" />

      <PathBottomSheet :open="skillSheetOpen" labelled-by="sample-preview-title-sheet" @close="closeSkillSheet">
        <SampleSkillPreview
          v-if="selected"
          :model="selected"
          layout="sheet"
          :active-video-id="activeVideoId"
          @play="activeVideoId = $event"
          @stop="activeVideoId = null"
        >
          <AppButton class="mt-1 w-full cursor-pointer" @click="openMineFromSkill">{{ SAMPLE_COPY.makeMine }}</AppButton>
        </SampleSkillPreview>
      </PathBottomSheet>

      <PathBottomSheet :open="mineSheetOpen" labelled-by="sample-mine-title-sheet" @close="closeMineSheet">
        <SampleMineBox v-model="note" :placeholder="placeholder" layout="sheet" @build="build(false)">
          <button
            type="button"
            class="min-h-11 cursor-pointer self-center rounded-xl px-3 text-[15px] font-extrabold text-ink underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            @click="build(true)"
          >
            {{ SAMPLE_COPY.skip }}
          </button>
        </SampleMineBox>
      </PathBottomSheet>
    </template>
  </div>
</template>
