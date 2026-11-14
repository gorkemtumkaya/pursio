<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  loadYouTubeApi,
  YT_EMBED_HOST,
  YT_STATE,
  type YTPlayer,
  type YTPlayerEvent,
} from '~/utils/youtube-iframe'

/**
 * Inline player on the privacy-enhanced embed domain (spec: skill-video-pipeline,
 * Req 12.3 to 12.5, 13.2). It is only mounted after a tap or a "Watch how"
 * activation, so autoplay follows a user gesture. `progress` carries the watched
 * seconds of this mount (the parent keys the player by video id), sent at most every 5 s and on pause, end and page leave.
 */
const props = defineProps<{ videoId: string; title: string }>()

const emit = defineEmits<{
  playing: []
  progress: [seconds: number]
  paused: []
  ended: []
}>()

const FLUSH_MS = 5000
const TICK_MS = 1000

const target = ref<HTMLElement | null>(null)
const failed = ref(false)
let player: YTPlayer | null = null
let watched = 0
let lastTick = 0
let lastFlush = 0
let timer: ReturnType<typeof setInterval> | null = null
let destroyed = false

function accumulate(): void {
  if (lastTick === 0) return
  const now = Date.now()
  const rate = player?.getPlaybackRate() ?? 1
  watched += ((now - lastTick) / 1000) * (Number.isFinite(rate) && rate > 0 ? rate : 1)
  lastTick = now
}

function flush(): void {
  lastFlush = Date.now()
  emit('progress', watched)
}

function startTimer(): void {
  if (timer !== null) return
  lastTick = Date.now()
  lastFlush = lastTick
  timer = setInterval(() => {
    accumulate()
    if (Date.now() - lastFlush >= FLUSH_MS) flush()
  }, TICK_MS)
}

function stopTimer(): void {
  if (timer === null) return
  accumulate()
  clearInterval(timer)
  timer = null
  lastTick = 0
}

function onStateChange(event: YTPlayerEvent): void {
  if (event.data === YT_STATE.playing) {
    emit('playing')
    startTimer()
  } else if (event.data === YT_STATE.paused) {
    stopTimer()
    flush()
    emit('paused')
  } else if (event.data === YT_STATE.ended) {
    stopTimer()
    flush()
    emit('ended')
  }
}

function onLeave(): void {
  if (timer === null) return
  accumulate()
  flush()
}

function onVisibility(): void {
  if (document.visibilityState === 'hidden') onLeave()
}

async function create(): Promise<void> {
  const element = target.value
  if (!element) return
  try {
    const yt = await loadYouTubeApi()
    if (destroyed) return
    player = new yt.Player(element, {
      host: YT_EMBED_HOST,
      videoId: props.videoId,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: window.location.origin },
      events: {
        onReady: (event) => event.target.playVideo(),
        onStateChange,
      },
    })
  } catch {
    // The video stays unavailable; the quests and the rest of the sheet keep working.
    failed.value = true
  }
}

onMounted(() => {
  window.addEventListener('pagehide', onLeave)
  document.addEventListener('visibilitychange', onVisibility)
  void create()
})

onBeforeUnmount(() => {
  destroyed = true
  window.removeEventListener('pagehide', onLeave)
  document.removeEventListener('visibilitychange', onVisibility)
  if (timer !== null) {
    accumulate()
    flush()
  }
  stopTimer()
  player?.destroy()
  player = null
})
</script>

<template>
  <div class="relative aspect-video w-full overflow-hidden rounded-2xl bg-surface-2" role="group" :aria-label="`Video player: ${title}`">
    <p v-if="failed" class="absolute inset-0 flex items-center justify-center p-4 text-center text-sm font-bold text-muted">
      This video could not be loaded.
    </p>
    <div v-else ref="target" class="size-full [&>iframe]:size-full" />
  </div>
</template>
