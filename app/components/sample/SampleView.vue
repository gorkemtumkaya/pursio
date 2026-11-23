<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import type { SamplePath } from '#shared/types/sample-path'
import { deriveNodeStates, emptyProgress } from '#shared/utils/progress-engine'
import { sampleToTree } from '#shared/utils/sample-path'
import { usePathLayout } from '~/composables/usePathLayout'
import { useViewportClass } from '~/composables/useViewportClass'
import { SAMPLE_COPY } from '~/utils/sample-copy'
import { canvasPreview, finishView, firstSkillId, previewModel } from '~/utils/sample-view'

/**
 * The sample path page (spec: sample-path, Requirements 4 to 6). It draws a static Sample with
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

const viewport = useViewportClass()
const { status, layout } = usePathLayout(tree, viewport)

/** Selected skill: the first one until the visitor picks another (Req 7.1). Kept across viewports (Req 7.9). */
const selectedId = ref<string | null>(firstSkillId(props.sample))
const ready = computed(() => status.value === 'ready' && layout.value !== null)
const selected = computed(() => (selectedId.value === null ? null : previewModel(props.sample, selectedId.value)))

/** The video playing in the preview; at most one (Req 8.3). */
const activeVideoId = ref<string | null>(null)

/** Mobile skill sheet, and the skill whose node opened it, for focus return (Req 7.3, 7.7). */
const skillSheetOpen = ref(false)
const openerId = ref<string | null>(null)
const canvas = useTemplateRef<{ focusNode: (id: string) => void }>('canvas')

/** Desktop: a click selects (Req 7.2). Mobile: a tap opens the sheet (Req 7.3). */
function onSelect(id: string): void {
  if (viewport.value === 'mobile') {
    selectedId.value = id
    activeVideoId.value = null
    openerId.value = id
    skillSheetOpen.value = true
    return
  }
  if (id === selectedId.value) return
  selectedId.value = id
  activeVideoId.value = null
}

function closeSkillSheet(): void {
  skillSheetOpen.value = false
  activeVideoId.value = null
  const opener = openerId.value
  if (opener !== null) void nextTick(() => canvas.value?.focusNode(opener))
}

// A change to desktop shows the selection in the panel; a change back opens no sheet (Req 7.9).
watch(viewport, (next) => {
  if (next !== 'mobile') skillSheetOpen.value = false
})

function focusNote(): void {
  // Task 8 wires the Make it yours box.
}
</script>

<template>
  <div>
    <SampleTopBar @build-own="focusNote" />

    <div class="mx-auto w-full max-w-[1048px] lg:grid lg:grid-cols-[minmax(0,1fr)_clamp(360px,32vw,420px)] lg:gap-9 lg:px-4">
      <main class="mx-auto w-full min-w-0 max-w-160 pt-5 lg:pt-7">
        <div class="px-4 lg:px-0">
          <SampleIntroCard :sample="sample" />
        </div>

        <div class="pt-6" :class="{ 'pb-24 lg:pb-10': ready }">
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

      <!-- Right column (desktop): the skill preview; Make it yours comes under it in task 8.
           -mr-7 takes back the side panel's own right padding, so the cards line up with the top bar. -->
      <div class="hidden lg:-mr-7 lg:block">
        <PathSidePanel v-if="viewport === 'desktop'">
          <SampleSkillPreview
            v-if="selected"
            :model="selected"
            layout="panel"
            :active-video-id="activeVideoId"
            @play="activeVideoId = $event"
            @stop="activeVideoId = null"
          />
        </PathSidePanel>
      </div>
    </div>

    <PathBottomSheet v-if="viewport === 'mobile'" :open="skillSheetOpen" labelled-by="sample-preview-title-sheet" @close="closeSkillSheet">
      <SampleSkillPreview
        v-if="selected"
        :model="selected"
        layout="sheet"
        :active-video-id="activeVideoId"
        @play="activeVideoId = $event"
        @stop="activeVideoId = null"
      />
    </PathBottomSheet>
  </div>
</template>
