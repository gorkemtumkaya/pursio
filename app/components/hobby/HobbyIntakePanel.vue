<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { IntakeProfile } from '#shared/types/learner-profile'
import { CHIP_REMOVE_LABELS, CHIP_TAGS, INTAKE_COPY, INTAKE_LEVEL_LABELS } from '~/utils/intake-copy'
import { detectedFields, focusAfterRemoval, selectQuestions, type PanelState, type ProfileField, type QuestionKind } from '~/utils/intake-panel'

/**
 * The Panel under the inputs of /new (spec: path-intake, Requirements 4 to 6): what intake read,
 * as removable Chips, at most 2 tap questions, and the two actions.
 */
const props = defineProps<{ state: PanelState }>()
const emit = defineEmits<{
  remove: [field: ProfileField]
  'toggle-goal': [id: string]
  'toggle-known': [id: string]
  'toggle-taste': [id: string]
  build: []
  skip: []
}>()

interface ChipView {
  field: ProfileField
  value: string
}

function chipValue(profile: IntakeProfile, field: ProfileField): string {
  if (field === 'level') return profile.level === null ? '' : INTAKE_LEVEL_LABELS[profile.level]
  if (field === 'goal') return profile.goal?.label ?? ''
  return (field === 'avoid' ? profile.avoid : profile.taste).join(', ')
}

const chips = computed<ChipView[]>(() =>
  detectedFields(props.state.profile).map((field) => ({ field, value: chipValue(props.state.profile, field) })),
)
const questions = computed(() => selectQuestions(props.state.profile))

function questionView(kind: QuestionKind) {
  const { profile } = props.state
  if (kind === 'goal') {
    return { title: INTAKE_COPY.questionGoal, hint: undefined, options: profile.goalOptions, selected: props.state.goalId ? [props.state.goalId] : [] }
  }
  if (kind === 'known') {
    return { title: INTAKE_COPY.questionKnown, hint: INTAKE_COPY.questionKnownHint, options: profile.knownOptions, selected: props.state.knownIds }
  }
  return { title: INTAKE_COPY.questionTaste, hint: undefined, options: profile.tasteOptions, selected: props.state.tasteIds }
}

function onToggle(kind: QuestionKind, id: string): void {
  if (kind === 'goal') emit('toggle-goal', id)
  else if (kind === 'known') emit('toggle-known', id)
  else emit('toggle-taste', id)
}

const heading = ref<HTMLElement | null>(null)
const chipRefs = new Map<ProfileField, { focus: () => void }>()
const questionRefs = ref<{ focus: () => void }[]>([])

function setChipRef(field: ProfileField, el: unknown): void {
  if (el && typeof el === 'object' && 'focus' in el && typeof el.focus === 'function') {
    chipRefs.set(field, el as { focus: () => void })
  } else {
    chipRefs.delete(field)
  }
}

function focusFirstQuestion(): void {
  questionRefs.value[0]?.focus()
}

/** Focus when the Panel opens: the heading when there are Chips, else the first question (Req 4.7, AS2). */
function focusStart(): void {
  if (chips.value.length > 0) heading.value?.focus()
  else focusFirstQuestion()
}

/** After a removal: the next Chip, else the previous one, else the first question (Req 4.6). */
async function onRemove(field: ProfileField): Promise<void> {
  const before = chips.value.map((chip) => chip.field)
  emit('remove', field)
  await nextTick()
  const target = focusAfterRemoval(before, field)
  if (target.kind === 'chip') chipRefs.get(target.field)?.focus()
  else focusFirstQuestion()
}

defineExpose({ focusStart })

const primaryButtonClass =
  'h-[52px] flex-1 max-[700px]:flex-none rounded-2xl bg-primary px-6 font-head text-lg font-semibold text-primary-ink '
  + 'shadow-[0_5px_0_var(--color-primary-deep)] transition-[translate,box-shadow] duration-75 '
  + 'active:translate-y-1 active:shadow-[0_1px_0_var(--color-primary-deep)] '
  + 'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary'
</script>

<template>
  <section aria-label="Your answers" class="flex flex-col gap-6 rounded-[22px] bg-surface-2 p-6 max-[700px]:gap-5 max-[700px]:p-4">
    <div v-if="chips.length > 0" class="flex flex-col gap-3">
      <h2 ref="heading" tabindex="-1" class="font-display text-lg leading-tight font-semibold text-ink outline-none">
        {{ INTAKE_COPY.chipsHeading }}
      </h2>
      <ul class="flex flex-wrap gap-2">
        <HobbyIntakeChip
          v-for="chip in chips"
          :key="chip.field"
          :ref="(el) => setChipRef(chip.field, el)"
          :tag="CHIP_TAGS[chip.field]"
          :value="chip.value"
          :remove-label="CHIP_REMOVE_LABELS[chip.field]"
          :warn="chip.field === 'avoid'"
          @remove="onRemove(chip.field)"
        />
      </ul>
    </div>

    <HobbyIntakeQuestion
      v-for="kind in questions"
      :key="kind"
      ref="questionRefs"
      v-bind="questionView(kind)"
      @toggle="onToggle(kind, $event)"
    />

    <div class="flex flex-wrap items-center gap-x-6 gap-y-3 max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:gap-y-2">
      <button type="button" :class="primaryButtonClass" @click="emit('build')">
        {{ INTAKE_COPY.build }}
      </button>
      <button
        type="button"
        class="min-h-11 rounded-lg px-1 max-[700px]:self-center font-head text-[17px] font-semibold text-ink underline underline-offset-4 hover:text-accent-text focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        @click="emit('skip')"
      >
        {{ INTAKE_COPY.skip }}
      </button>
    </div>
  </section>
</template>
