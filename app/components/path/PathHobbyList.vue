<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { NEW_HOBBY_PATH, type HobbyEntry } from '~/utils/hobby-store'

/**
 * "Your hobbies" list with real progress and "+ Add a hobby", shared by the
 * desktop sidebar and the mobile hobby Bottom_Sheet (spec: local-progress-data,
 * Req 4.1 to 4.6). An entry with `to: null` is a demo entry that does nothing.
 * Real entries have a "⋯" menu (Archive, Delete…); archived entries are listed
 * under "Archived (N)" with Restore. The parent does the work.
 */
const props = withDefaults(
  defineProps<{
    hobbies: readonly HobbyEntry[]
    archived?: readonly HobbyEntry[]
    activeId: string | null
    headingId: string
    layout: 'sidebar' | 'sheet'
  }>(),
  { archived: () => [] },
)

const emit = defineEmits<{
  /** An entry or "+ Add a hobby" was activated, so the sheet can close. */
  navigate: []
  archive: [entry: HobbyEntry]
  reset: [entry: HobbyEntry]
  delete: [entry: HobbyEntry]
  restore: [entry: HobbyEntry]
}>()

const archivedListId = useId()
const showArchived = ref(false)
watch(
  () => props.archived.length,
  (count) => {
    if (count === 0) showArchived.value = false
  },
)

const cardClass =
  'flex min-h-11 w-full flex-col gap-2 rounded-2xl border-2 bg-surface px-3.5 py-3 text-left text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'
</script>

<template>
  <section :aria-labelledby="headingId" class="flex flex-col gap-2.5">
    <div class="flex items-center justify-between gap-3" :class="layout === 'sheet' ? 'min-h-11 pr-14' : ''">
      <h2
        :id="headingId"
        tabindex="-1"
        :class="
          layout === 'sheet'
            ? 'font-head text-[28px] leading-tight font-semibold text-ink outline-none'
            : 'text-xs font-extrabold tracking-widest text-muted outline-none'
        "
      >
        {{ layout === 'sheet' ? 'Your hobbies' : 'YOUR HOBBIES' }}
      </h2>
      <span aria-hidden="true" class="text-xs font-extrabold text-muted">{{ hobbies.length }}</span>
    </div>
    <ul class="flex flex-col gap-2.5">
      <li v-for="entry in hobbies" :key="entry.id" class="group relative">
        <template v-if="entry.to !== null">
          <NuxtLink
            :to="entry.to"
            :aria-current="entry.id === activeId ? 'page' : undefined"
            :class="[cardClass, entry.id === activeId ? 'border-ink' : 'border-line']"
            @click="emit('navigate')"
          >
            <PathHobbyProgress :hobby="entry.hobby" :percent="entry.percent" reserve-action />
          </NuxtLink>
          <PathHobbyOptions
            class="absolute top-0.5 right-1"
            :hobby="entry.hobby"
            :always-visible="layout === 'sheet'"
            :can-reset="entry.id === activeId"
            @archive="emit('archive', entry)"
            @reset="emit('reset', entry)"
            @delete="emit('delete', entry)"
          />
        </template>
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
      :to="NEW_HOBBY_PATH"
      :class="[
        'flex h-12 items-center justify-center rounded-2xl border-2 border-dashed border-locked-deep text-[15px] font-extrabold text-muted hover:bg-surface-2',
        focusRing,
      ]"
      @click="emit('navigate')"
    >
      + Add a hobby
    </NuxtLink>

    <div v-if="archived.length > 0" class="flex flex-col gap-1">
      <button
        type="button"
        :aria-expanded="showArchived"
        :aria-controls="archivedListId"
        :class="['flex h-11 items-center gap-1 self-start rounded-xl pr-2 text-[13px] font-extrabold text-muted hover:text-ink', focusRing]"
        @click="showArchived = !showArchived"
      >
        <PathIcon
          name="chevron"
          class="size-4 transition-transform motion-reduce:transition-none"
          :class="showArchived ? '' : '-rotate-90'"
        />
        Archived ({{ archived.length }})
      </button>
      <ul v-show="showArchived" :id="archivedListId" class="flex flex-col gap-2">
        <li
          v-for="entry in archived"
          :key="entry.id"
          class="flex items-center justify-between gap-2 rounded-2xl bg-surface-2 py-0.5 pr-1 pl-3.5"
        >
          <span class="min-w-0 truncate text-sm font-extrabold text-muted">{{ entry.hobby }}</span>
          <button
            type="button"
            :aria-label="`Restore ${entry.hobby}`"
            :class="['group/restore flex h-11 shrink-0 items-center rounded-xl px-1', focusRing]"
            @click="emit('restore', entry)"
          >
            <span
              class="rounded-lg border-2 border-line bg-surface px-2.5 py-1 text-xs font-extrabold text-ink group-hover/restore:border-ink"
            >
              Restore
            </span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
