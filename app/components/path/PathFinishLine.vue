<script setup lang="ts">
import { computed } from 'vue'
import { FINISH_LINE_COPY, type FinishLineView } from '~/utils/finish-line'

/**
 * Finish line card at the end of the path, under the last node (design: `dev_docs/Finish line card · three states`).
 * Three states: not started, in progress, reached. The layout follows the width of the
 * column, not of the window, because the desktop column is narrow next to the side panel.
 */
const props = defineProps<{
  view: FinishLineView
  /**
   * Preview_Mode (spec: sample-path, Req 6.1, 6.2): only the flag, the eyebrow and the title, in a
   * paragraph, because the page already has the finish line as its `h1`. No count, bar or state.
   */
  plain?: boolean
}>()

const reached = computed(() => !props.plain && props.view.state === 'reached')
const reachedLine = computed(() =>
  FINISH_LINE_COPY.reached(props.view.done, props.view.total, props.view.reachedAt),
)
</script>

<template>
  <div class="@container">
    <section
      aria-labelledby="finish-line-title"
      class="flex flex-col gap-3.5 rounded-3xl px-4.5 py-4 @lg:px-6 @lg:py-5.5"
      :class="reached
        ? 'bg-done text-done-ink shadow-raised-done'
        : 'border-2 border-ink bg-surface text-ink shadow-raised-line'"
    >
      <div class="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:gap-5">
        <div class="flex min-w-0 flex-1 items-center gap-3.5 @lg:gap-4.5">
          <span
            aria-hidden="true"
            class="flex size-11 shrink-0 items-center justify-center rounded-xl @lg:size-14 @lg:rounded-2xl"
            :class="reached ? 'bg-done-ink text-done-deep' : 'bg-ink text-bg'"
          >
            <PathIcon name="flag" class="size-6 @lg:size-7" />
          </span>
          <div class="flex min-w-0 flex-col gap-0.5">
            <p
              class="text-[13px] font-extrabold tracking-[0.06em] uppercase"
              :class="reached ? 'text-done-ink' : 'text-muted'"
            >
              {{ reached ? FINISH_LINE_COPY.eyebrowReached : FINISH_LINE_COPY.eyebrow }}
            </p>
            <component
              :is="plain ? 'p' : 'h2'"
              id="finish-line-title"
              class="font-display text-xl leading-tight font-semibold wrap-break-word @lg:text-2xl"
            >
              {{ view.title }}
            </component>
            <p v-if="reached" class="hidden pt-0.5 text-sm font-bold @lg:block">{{ reachedLine }}</p>
          </div>
        </div>

        <template v-if="!plain && view.state === 'not-started'">
          <p class="hidden shrink-0 rounded-xl bg-surface-2 px-3 py-1.5 text-sm font-extrabold text-ink @lg:block">
            {{ FINISH_LINE_COPY.toGo(view.left) }}
          </p>
          <p class="text-[15px] font-bold text-muted @lg:hidden">{{ FINISH_LINE_COPY.between(view.left) }}</p>
        </template>
        <p v-else-if="reached" class="text-sm font-bold @lg:hidden">{{ reachedLine }}</p>
      </div>

      <template v-if="!plain && view.state === 'in-progress'">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[15px] font-extrabold @lg:flex-nowrap">
          <span class="text-ink">{{ FINISH_LINE_COPY.count(view.done, view.total) }}</span>
          <PathXpBar
            :percent="view.percent"
            label="Skills completed toward the finish line"
            class="order-last w-full ring-2 ring-ink @lg:order-0 @lg:w-auto @lg:flex-1"
          />
          <span class="text-muted">{{ FINISH_LINE_COPY.left(view.left) }}</span>
        </div>
        <p v-if="view.nextMilestone" class="text-[15px] font-bold text-muted">
          {{ FINISH_LINE_COPY.nextMilestone(view.nextMilestone) }}
        </p>
      </template>
    </section>
  </div>
</template>
