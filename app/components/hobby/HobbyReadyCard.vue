<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { INTAKE_COPY } from '~/utils/intake-copy'
import type { TreeSummary } from '~/utils/tree-summary'

/**
 * Ready card of the new hobby page (spec: new-hobby-page). With a profile it also shows the
 * finish line and the head start of the known skills (spec: path-intake, Requirement 12).
 */
defineProps<{ summary: TreeSummary }>()
defineEmits<{ open: [] }>()

const openButton = ref<HTMLButtonElement | null>(null)

onMounted(() => {
  openButton.value?.focus()
})
</script>

<template>
  <div class="flex flex-col gap-5">
    <dl class="grid grid-cols-3 gap-3 text-center">
      <div class="flex flex-col gap-1 rounded-2xl bg-surface-2 px-2 py-3">
        <dd class="font-head text-2xl font-bold text-ink">{{ summary.skills }}</dd>
        <dt class="text-sm font-bold text-muted">skills</dt>
      </div>
      <div class="flex flex-col gap-1 rounded-2xl bg-surface-2 px-2 py-3">
        <dd class="font-head text-2xl font-bold text-ink">{{ summary.sections }}</dd>
        <dt class="text-sm font-bold text-muted">sections</dt>
      </div>
      <div class="flex flex-col gap-1 rounded-2xl bg-surface-2 px-2 py-3">
        <dd class="font-head text-2xl font-bold text-ink">{{ summary.quests }}</dd>
        <dt class="text-sm font-bold text-muted">quests</dt>
      </div>
    </dl>

    <div
      v-if="summary.finishLine"
      class="flex items-center gap-4 rounded-2xl border-2 border-ink bg-surface px-4 py-3.5"
    >
      <span class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ink text-bg">
        <PathIcon name="flag" class="size-6" />
      </span>
      <p class="flex min-w-0 flex-col gap-0.5">
        <span class="text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted">{{ INTAKE_COPY.finishLine }}</span>
        <span class="font-display text-xl leading-tight font-semibold text-ink">{{ summary.finishLine }}</span>
      </p>
    </div>

    <section
      v-if="summary.headStartXp > 0"
      aria-labelledby="head-start-title"
      class="flex flex-col gap-3 rounded-2xl bg-surface-2 px-4 py-3.5"
    >
      <div class="flex items-start justify-between gap-3">
        <h2 id="head-start-title" class="font-head text-lg leading-tight font-bold text-ink">
          {{ INTAKE_COPY.headStart }}
        </h2>
        <span class="shrink-0 rounded-full bg-done px-3 py-1 font-display text-base font-semibold text-done-ink">
          {{ INTAKE_COPY.headStartXp(summary.headStartXp) }}
        </span>
      </div>
      <ul class="flex flex-wrap gap-2">
        <li
          v-for="label in summary.knownLabels"
          :key="label"
          class="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[15px] font-extrabold text-ink"
        >
          <PathIcon name="check" class="size-4 shrink-0 text-done-deep" />
          {{ label }}
        </li>
      </ul>
      <p class="text-sm font-bold text-muted">
        {{ INTAKE_COPY.headStartNote }}
      </p>
    </section>

    <p class="text-sm font-bold text-muted">
      First up: <strong class="text-ink">{{ summary.firstSkill }}</strong>
    </p>

    <button
      ref="openButton"
      type="button"
      class="h-14 w-full rounded-2xl bg-primary font-head text-lg font-semibold text-primary-ink shadow-raised-primary bouncy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      @click="$emit('open')"
    >
      Open my path
    </button>
  </div>
</template>
