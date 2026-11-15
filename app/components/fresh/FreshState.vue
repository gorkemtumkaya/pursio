<script setup lang="ts">
import MascotWick from '~/components/mascot/wick.vue'

/**
 * Wick and the lines of the Fresh_Page states (spec: fresh, Req 16.1 to 16.6, 14.7):
 * `loading` (Wick thinking, no line), `no_paths` ("Build your first path"), `quiet` (one line
 * above the cards), `empty`, `saved_empty` and `error` with "Try again", which is disabled
 * while its request is pending.
 */
defineProps<{
  kind: 'loading' | 'no_paths' | 'quiet' | 'empty' | 'saved_empty' | 'error'
  /** Error only: a retry request is in flight. */
  pending?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { theme } = useTheme()

const LINES = {
  quiet: 'No new videos today. Here are the best ones for your skills.',
  empty: 'No videos yet. Pursio checks for new ones every day.',
  saved_empty: 'No saved videos yet.',
  error: "Couldn't load Fresh right now.",
  no_paths: 'Fresh shows new videos for the skills on your paths.',
} as const

</script>

<template>
  <p v-if="kind === 'quiet'" class="rounded-2xl bg-surface-2 px-4 py-3 text-sm font-bold text-muted">
    {{ LINES.quiet }}
  </p>
  <p v-else-if="kind === 'saved_empty'" class="rounded-2xl bg-surface-2 px-4 py-3.5 text-sm font-bold text-muted">
    {{ LINES.saved_empty }}
  </p>
  <div
    v-else
    class="flex flex-col items-center gap-3 rounded-3xl bg-surface-2 px-6 py-8 text-center"
    :role="kind === 'loading' ? 'status' : kind === 'error' ? 'alert' : undefined"
  >
    <MascotWick
      :theme="theme"
      outfit="none"
      :mood="kind === 'loading' ? 'think' : kind === 'error' ? 'sleep' : 'idle'"
      :size="96"
      aria-hidden="true"
    />
    <p v-if="kind === 'loading'" class="sr-only">Loading Fresh…</p>
    <p v-else class="max-w-80 text-[15px] font-bold text-ink">{{ LINES[kind] }}</p>
    <NuxtLink
      v-if="kind === 'no_paths'"
      to="/new"
      class="inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-head text-[15px] font-extrabold text-primary-ink shadow-raised-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      Build your first path
    </NuxtLink>
    <button
      v-if="kind === 'error'"
      type="button"
      :disabled="pending"
      class="inline-flex min-h-12 items-center rounded-xl border-2 border-line bg-surface px-5 font-head text-[15px] font-extrabold text-ink shadow-raised-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
      @click="emit('retry')"
    >
      Try again
    </button>
  </div>
</template>
