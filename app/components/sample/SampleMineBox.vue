<script setup lang="ts">
import { ref } from 'vue'
import { SAMPLE_COPY } from '~/utils/sample-copy'

/**
 * "Make it yours" (spec: sample-path, Requirement 9): the note box that hands the visitor over to
 * the new hobby flow. It reuses the new hobby page's note field (grows with its text, 800 limit,
 * counter) and primary button. `panel`: the tinted desktop card. `sheet`: inside the mobile sheet,
 * with "Skip" from the default slot. The note itself lives in the page, so both layouts share it.
 */
const props = defineProps<{ placeholder: string; layout: 'panel' | 'sheet' }>()
const note = defineModel<string>({ required: true })
const emit = defineEmits<{ build: []; noteFocus: [] }>()

const root = ref<HTMLElement | null>(null)
const titleId = `sample-mine-title-${props.layout}`

/** The first focus of the note counts as opening Make it yours (Req 11.5). */
function onFocusIn(event: FocusEvent): void {
  if (event.target instanceof HTMLTextAreaElement) emit('noteFocus')
}

/** "Build my own path" in the top bar puts the caret here (Req 4.3). */
function focusNote(): void {
  root.value?.querySelector('textarea')?.focus()
}

defineExpose({ focusNote })
</script>

<template>
  <section
    ref="root"
    :aria-labelledby="titleId"
    class="flex flex-col gap-4"
    :class="layout === 'panel' ? 'rounded-3xl border-2 border-primary bg-primary-soft p-6 shadow-raised-primary' : ''"
    @focusin="onFocusIn"
  >
    <h2 :id="titleId" class="font-head text-2xl leading-tight font-semibold text-ink" :class="layout === 'sheet' ? 'pr-14' : ''">
      {{ SAMPLE_COPY.mineHeading }}
    </h2>
    <form class="flex flex-col gap-3.5" @submit.prevent="emit('build')">
      <HobbyNoteField
        v-model="note"
        :label="SAMPLE_COPY.mineLabel"
        :hint="null"
        :placeholder="placeholder"
        label-style="text"
      />
      <AppButton type="submit" class="w-full cursor-pointer">{{ SAMPLE_COPY.build }}</AppButton>
    </form>
    <slot />
    <p class="text-[13px] font-bold text-muted" :class="layout === 'sheet' ? 'text-center' : ''">{{ SAMPLE_COPY.smallLine }}</p>
  </section>
</template>
