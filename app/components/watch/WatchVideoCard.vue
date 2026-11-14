<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RankedVideo } from '#shared/types/video'
import { formatDuration, showPoolLanguageLabel } from '#shared/utils/watch-how'

/**
 * One suggested video (spec: skill-video-pipeline, Req 12.2, 12.3, 12.14, 12.18, 13.7).
 * A tap emits `play`. While `active`, the `player` slot replaces the thumbnail.
 * `skipped` fires once when the card was at least 50% visible for 2 s without a play.
 */
const props = defineProps<{
  video: RankedVideo
  /** The user's Language_Code. */
  language: string
  active: boolean
}>()

const emit = defineEmits<{ play: []; skipped: [] }>()

const SKIP_VISIBLE_MS = 2000

const root = ref<HTMLElement | null>(null)
const duration = computed(() => formatDuration(props.video.durationSeconds))
const poolLabel = computed(() =>
  showPoolLanguageLabel(props.video, props.language) ? props.video.poolLanguage.toUpperCase() : null,
)
const buttonName = computed(
  () =>
    `Play ${props.video.title}, ${props.video.channel}, ${duration.value}` +
    (poolLabel.value ? `, language ${poolLabel.value}` : ''),
)

let observer: IntersectionObserver | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let reported = false

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

function onIntersect(entries: IntersectionObserverEntry[]): void {
  const entry = entries[entries.length - 1]
  if (!entry) return
  if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !props.active && !reported) {
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null
        reported = true
        emit('skipped')
      }, SKIP_VISIBLE_MS)
    }
  } else {
    clearTimer()
  }
}

onMounted(() => {
  if (!root.value || typeof IntersectionObserver === 'undefined') return
  observer = new IntersectionObserver(onIntersect, { threshold: [0, 0.5, 1] })
  observer.observe(root.value)
})

// A played card is never reported as skipped.
watch(
  () => props.active,
  (active) => {
    if (active) clearTimer()
  },
)

onBeforeUnmount(() => {
  clearTimer()
  observer?.disconnect()
  observer = null
})
</script>

<template>
  <div ref="root" class="flex flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-2">
    <slot v-if="active" name="player" />
    <button
      v-else
      type="button"
      class="group relative block aspect-video w-full overflow-hidden rounded-xl bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      :aria-label="buttonName"
      @click="emit('play')"
    >
      <img :src="video.thumbnailUrl" alt="" loading="lazy" class="size-full object-cover" />
      <span class="absolute inset-0 flex items-center justify-center" aria-hidden="true">
        <span class="flex size-12 items-center justify-center rounded-full bg-primary text-primary-ink shadow-raised-line">
          <svg viewBox="0 0 24 24" class="size-6" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </span>
      </span>
      <span
        class="absolute right-2 bottom-2 rounded-lg bg-ink px-1.5 py-0.5 text-xs font-extrabold text-surface"
        aria-hidden="true"
      >
        {{ duration }}
      </span>
    </button>
    <div class="flex items-start gap-2 px-1 pb-1">
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="text-[15px] leading-snug font-bold text-ink">{{ video.title }}</span>
        <span class="text-xs font-semibold text-muted">{{ video.channel }}</span>
      </div>
      <span
        v-if="poolLabel"
        class="shrink-0 rounded-full border-2 border-line px-2 py-0.5 text-xs font-extrabold text-muted"
      >
        {{ poolLabel }}
      </span>
    </div>
  </div>
</template>
