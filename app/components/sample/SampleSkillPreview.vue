<script setup lang="ts">
import { XP_PER_QUEST } from '#shared/utils/xp'
import { SAMPLE_COPY } from '~/utils/sample-copy'
import type { PreviewModel } from '~/utils/sample-view'

/**
 * Skill_Preview (spec: sample-path, Requirement 7): what a skill holds, read only. Same look as the
 * path screen's skill detail, without its state chip, lock note and complete button (Req 7.6).
 * `panel` is the desktop card; `sheet` sits in the mobile bottom sheet, whose close button takes
 * the top right corner. The default slot ends the preview (the sheet's "Make this path mine").
 */
const props = defineProps<{ model: PreviewModel; layout: 'panel' | 'sheet'; activeVideoId: string | null }>()
const emit = defineEmits<{ play: [id: string]; stop: [] }>()

/** Ids for `aria-labelledby`; the sheet points at the title. Only one layout shows at a time. */
const titleId = `sample-preview-title-${props.layout}`
const videosId = `sample-preview-videos-${props.layout}`
</script>

<template>
  <section
    :aria-labelledby="titleId"
    class="flex flex-col"
    :class="layout === 'panel' ? 'gap-4 rounded-3xl border-2 border-line bg-surface p-6 shadow-raised-line' : 'gap-4'"
  >
    <div class="flex min-h-11 items-center justify-between gap-3" :class="layout === 'sheet' ? 'pr-14' : ''">
      <span
        class="rounded-lg px-2.5 py-1 text-xs font-extrabold tracking-wide"
        :class="model.tag === SAMPLE_COPY.previewFirst ? 'bg-primary-soft text-accent-text' : 'bg-surface-2 text-ink'"
      >
        {{ model.tag }}
      </span>
      <span class="text-[13px] font-bold text-muted">{{ SAMPLE_COPY.position(model.position.section, model.position.skill) }}</span>
    </div>

    <div class="flex flex-col gap-1.5">
      <h2 :id="titleId" class="font-head leading-tight font-semibold text-ink" :class="layout === 'panel' ? 'text-3xl' : 'text-[28px]'">
        {{ model.title }}
      </h2>
      <p class="text-[15px] leading-normal text-muted">{{ model.description }}</p>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="flex items-baseline justify-between gap-3 font-head text-[13px] font-extrabold tracking-wider text-muted">
        <span>{{ SAMPLE_COPY.questsHeading(model.quests.length) }}</span>
        <span>{{ SAMPLE_COPY.questXp(XP_PER_QUEST) }}</span>
      </h3>
      <ul class="flex flex-col gap-2">
        <li v-for="(quest, index) in model.quests" :key="index">
          <PathQuestItem :text="quest" :checked="false" readonly />
        </li>
      </ul>
    </div>

    <SampleVideoList
      :videos="model.videos"
      :active-id="activeVideoId"
      :heading-id="videosId"
      @play="emit('play', $event)"
      @stop="emit('stop')"
    />

    <slot />
  </section>
</template>
