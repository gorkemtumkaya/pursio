<script setup lang="ts">
import { computed } from 'vue'
import { NOTE_MAX } from '#shared/utils/learner-profile'
import { INTAKE_COPY } from '~/utils/intake-copy'

/**
 * The optional "Tell Wick more" textarea (spec: path-intake, Req 1.1, 1.2). The sample page's
 * "Make it yours" box reuses it with its own label, no "optional" hint and a placeholder per
 * hobby (spec: sample-path, Req 9.1, 9.2): `labelStyle: 'text'` shows the label as a sentence.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    readonly?: boolean
    label?: string
    /** Shown after the label; null hides it. */
    hint?: string | null
    placeholder?: string
    labelStyle?: 'eyebrow' | 'text'
  }>(),
  {
    readonly: false,
    label: INTAKE_COPY.noteLabel,
    hint: INTAKE_COPY.noteOptional,
    placeholder: INTAKE_COPY.notePlaceholder,
    labelStyle: 'eyebrow',
  },
)
defineEmits<{ 'update:modelValue': [string] }>()

const id = useId()
const counterId = useId()
/** The counter shows from 40 characters left (AS1), so the field looks as in the mockup until then. */
const left = computed(() => NOTE_MAX - props.modelValue.length)
const showCounter = computed(() => left.value <= 40)
</script>

<template>
  <div class="flex flex-col gap-2">
    <label :for="id" class="flex items-baseline gap-2">
      <span
        :class="labelStyle === 'text'
          ? 'text-[15px] leading-snug font-bold text-ink'
          : 'text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted'"
      >{{ label }}</span>
      <span v-if="hint" class="text-sm font-bold text-muted">{{ hint }}</span>
    </label>
    <textarea
      :id="id"
      :value="modelValue"
      :readonly="readonly"
      :maxlength="NOTE_MAX"
      :aria-describedby="showCounter ? counterId : undefined"
      rows="3"
      name="note"
      autocomplete="off"
      :placeholder="placeholder"
      class="[field-sizing:content] max-h-[240px] min-h-[104px] w-full resize-none rounded-[18px] border-2 bg-bg px-[18px] py-3.5 text-base leading-normal font-bold text-ink outline-none placeholder:font-semibold placeholder:text-muted focus:border-primary read-only:opacity-80"
      :class="modelValue.trim() ? 'border-primary' : 'border-line'"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <p v-if="showCounter" :id="counterId" aria-live="polite" class="self-end text-sm font-bold text-muted">
      {{ INTAKE_COPY.noteLeft(left) }}
    </p>
  </div>
</template>
