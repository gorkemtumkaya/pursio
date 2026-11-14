<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { NodeState } from '#shared/types/progress'
import type { QuestTriple, SkillNode } from '#shared/types/skill-tree'
import type { SkillVideosState } from '#shared/types/video'
import { watchHowFor as watchHowForQuest } from '#shared/utils/watch-how'
import type { FreshItem } from '~/utils/fresh-samples'
import { buttonFor, chipFor, detailTitleId, formatTitleList } from '~/utils/node-visual'

/**
 * Node_Detail content shared by the Bottom_Sheet and the Side_Panel
 * (Req 8.4–8.12). `lockedBy` holds the titles of uncompleted prerequisites.
 */
const props = defineProps<{
  node: SkillNode
  state: NodeState
  isCurrent: boolean
  checks: QuestTriple<boolean>
  position?: { section: number; skill: number }
  lockedBy: readonly string[]
  fresh: readonly FreshItem[]
  layout: 'sheet' | 'panel'
  /** Videos for this skill (spec: skill-video-pipeline); absent or `hidden` shows no Watch section. */
  videos?: SkillVideosState
}>()

const emit = defineEmits<{ toggle: [index: number]; complete: [] }>()

/** The video playing in the Watch section, set by a card or a "Watch how" link. */
const activeVideoId = ref<string | null>(null)
const readyVideos = computed(() => (props.videos?.kind === 'ready' ? props.videos.videos : []))
const watchLanguage = computed(() => (props.videos?.kind === 'ready' ? props.videos.language : 'en'))
const finding = computed(() => props.videos?.kind === 'finding')

// A different skill starts with no video playing.
watch(
  () => props.node.id,
  () => {
    activeVideoId.value = null
  },
)

function watchHowFor(text: string) {
  return watchHowForQuest(text, readyVideos.value)
}

const chip = computed(() => chipFor(props.state))
const button = computed(() => buttonFor(props.state))
const locked = computed(() => props.state === 'locked')
const checkedCount = computed(() => props.checks.filter(Boolean).length)
const titleId = computed(() => detailTitleId(props.layout))
const lockedNote = computed(() =>
  props.lockedBy.length > 0
    ? `Finish ${formatTitleList(props.lockedBy)} to unlock this skill.`
    : 'Finish the earlier skills to unlock this skill.',
)

/** No click handler on a disabled button, so activation can never complete (Req 9.2). */
const buttonListeners = computed(() => (button.value.enabled ? { click: () => emit('complete') } : {}))
</script>

<template>
  <section
    :aria-labelledby="titleId"
    class="flex flex-col"
    :class="
      layout === 'panel'
        ? 'gap-4.5 rounded-3xl border-2 border-line bg-surface p-6 shadow-raised-line'
        : 'gap-4'
    "
  >
    <div class="flex min-h-11 items-center justify-between gap-3" :class="layout === 'sheet' ? 'pr-14' : ''">
      <span class="rounded-lg px-2.5 py-1 text-xs font-extrabold tracking-wide" :class="chip.classes">
        {{ chip.label }}
      </span>
      <span v-if="position" class="text-[13px] font-bold text-muted">
        Section {{ position.section }} · Skill {{ position.skill }}
      </span>
    </div>

    <div class="flex flex-col gap-1.5">
      <h2
        :id="titleId"
        class="font-head leading-tight font-semibold text-ink"
        :class="layout === 'panel' ? 'text-3xl' : 'text-[28px]'"
      >
        {{ node.title }}
      </h2>
      <p class="text-[15px] leading-normal text-muted">{{ node.description }}</p>
    </div>

    <p
      v-if="locked"
      class="flex items-center gap-2.5 rounded-2xl bg-surface-2 px-4 py-3.5 text-sm font-bold text-muted"
    >
      <PathIcon name="lock" class="size-5 shrink-0" />
      <span>{{ lockedNote }}</span>
    </p>

    <template v-else>
      <div class="flex flex-col gap-2">
        <h3 class="font-head text-[13px] font-extrabold tracking-wider text-muted">
          QUESTS · {{ checkedCount }} OF 3
        </h3>
        <ul class="flex flex-col gap-2">
          <li v-for="(quest, index) in node.quests" :key="index">
            <PathQuestItem
              :text="quest"
              :checked="checks[index] ?? false"
              :watch-how="watchHowFor(quest)"
              @toggle="emit('toggle', index)"
              @watch="activeVideoId = $event"
            />
          </li>
        </ul>
      </div>

      <WatchSection
        :videos="readyVideos"
        :language="watchLanguage"
        :finding="finding"
        :active-id="activeVideoId"
        @play="activeVideoId = $event"
        @stop="activeVideoId = null"
      />

      <!-- Hidden until the node has real content (spec: local-progress-data, Req 5.2). -->
      <PathFreshList v-if="fresh.length > 0" :items="fresh" :layout="layout" />
    </template>

    <button
      type="button"
      class="h-14 w-full rounded-2xl font-head text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed"
      :class="button.classes"
      :disabled="!button.enabled"
      v-on="buttonListeners"
    >
      {{ button.label }}
    </button>
  </section>
</template>
