<script setup lang="ts">
import type { HobbyEntry } from '~/utils/hobby-store'

/**
 * "Your hobbies" list with real progress and "+ Add a hobby", shared by the
 * desktop sidebar and the mobile hobby Bottom_Sheet (spec: local-progress-data,
 * Req 4.1 to 4.6). An entry with `to: null` is a demo entry that does nothing.
 */
defineProps<{
  hobbies: readonly HobbyEntry[]
  activeId: string | null
  headingId: string
  layout: 'sidebar' | 'sheet'
}>()

/** Fired when an entry or "+ Add a hobby" is activated, so the sheet can close. */
const emit = defineEmits<{ navigate: [] }>()

const cardClass =
  'flex min-h-11 w-full flex-col gap-2 rounded-2xl border-2 bg-surface px-3.5 py-3 text-left text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-2.5">
    <h2
      :id="headingId"
      :class="
        layout === 'sheet'
          ? 'flex min-h-11 items-center pr-14 font-head text-[28px] leading-tight font-semibold text-ink'
          : 'text-xs font-extrabold tracking-widest text-muted'
      "
    >
      {{ layout === 'sheet' ? 'Your hobbies' : 'YOUR HOBBIES' }}
    </h2>
    <ul class="flex flex-col gap-2.5">
      <li v-for="entry in hobbies" :key="entry.id">
        <NuxtLink
          v-if="entry.to !== null"
          :to="entry.to"
          :aria-current="entry.id === activeId ? 'page' : undefined"
          :class="[cardClass, entry.id === activeId ? 'border-ink' : 'border-line']"
          @click="emit('navigate')"
        >
          <PathHobbyProgress :hobby="entry.hobby" :percent="entry.percent" />
        </NuxtLink>
        <button
          v-else
          type="button"
          :aria-current="entry.id === activeId ? 'true' : undefined"
          :class="[cardClass, entry.id === activeId ? 'border-ink' : 'border-line']"
        >
          <PathHobbyProgress :hobby="entry.hobby" :percent="entry.percent" />
        </button>
      </li>
    </ul>
    <NuxtLink
      to="/"
      class="flex h-12 items-center justify-center rounded-2xl border-2 border-dashed border-locked-deep text-[15px] font-extrabold text-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      @click="emit('navigate')"
    >
      + Add a hobby
    </NuxtLink>
  </section>
</template>
