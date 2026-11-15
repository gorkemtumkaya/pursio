import { shallowRef, type ShallowRef } from 'vue'
import type { SaveSnapshot } from '#shared/types/fresh'
import type { VideoEvent, VideoSource } from '#shared/types/video'
import { combineSources } from '#shared/utils/video-events'

/** The details a Fresh card shows; a save takes its Save_Snapshot from them (spec: fresh, Req 17.4). */
export interface FreshShownVideo {
  videoId: string
  title: string
  channel: string
  channelId: string | null
  thumbnailUrl: string
  durationSeconds: number
}

/** The part of `useVideoEvents` the Fresh_Page uses. */
export interface FreshRecorder {
  recordPlay(videoId: string, source: VideoSource): void
  recordProgress(videoId: string, seconds: number, durationSeconds: number | null | undefined, source: VideoSource): void
  recordSave(videoId: string, saved: boolean, source: VideoSource, snapshot?: SaveSnapshot | null): void
  recordSkip(videoId: string, source: VideoSource): void
}

/** The Save_Snapshot of a shown card: id, title, channel name, channel id, thumbnail and duration. */
export function snapshotOf(video: FreshShownVideo): SaveSnapshot {
  return {
    videoId: video.videoId,
    title: video.title,
    channel: video.channel,
    channelId: video.channelId,
    thumbnailUrl: video.thumbnailUrl,
    durationSeconds: video.durationSeconds,
  }
}

/** Combined saved value of a video over all sources (skill-video-pipeline Req 13.16). */
export function isSavedIn(events: readonly VideoEvent[], videoId: string): boolean {
  return combineSources(events.filter((e) => e.videoId === videoId))?.saved === true
}

export interface FreshActionsOptions {
  /** Demo_Mode: nothing is recorded (Req 17.9). */
  demo: boolean
  /** Null in Demo_Mode. */
  recorder: FreshRecorder | null
  /** Merged events (cloud rows plus local unsent). */
  events: () => readonly VideoEvent[]
  /** True when the video's card is shown under the current chip and mutes. */
  shown: (videoId: string) => boolean
}

export interface FreshActions {
  /** The one video playing on the page (Req 12.5, 13.6, 13.7). */
  activeVideoId: ShallowRef<string | null>
  /** Starts a video and stops any other: its player unmounts and flushes its progress (Req 17.2). */
  play(videoId: string): void
  stop(): void
  /** Stops the active video when a chip or mute change hid its card (Req 17.2). */
  syncShown(): void
  onPlaying(video: FreshShownVideo): void
  /** Watched seconds; finishing at 80% is part of the progress reducer (Req 17.2, 17.3). */
  onProgress(video: FreshShownVideo, seconds: number): void
  /** Toggles the saved value; a save stores the card's Save_Snapshot (Req 12.6, 17.4). */
  toggleSave(video: FreshShownVideo): void
  /** A card was 50% visible for 2 s; recorded only when never played and still shown (Req 17.5). */
  onSkipped(videoId: string): void
  isSaved(videoId: string): boolean
}

/**
 * Fresh_Page playback and event recording (spec: fresh, Req 12.5, 12.6, 13.6, 13.7, 17.1 to
 * 17.9). Every record uses Source `feed`. It never touches the progress engine, so XP, level,
 * streak, quests and completion stay the same (Req 17.7). In Demo_Mode it records nothing.
 */
export function createFreshActions(options: FreshActionsOptions): FreshActions {
  const activeVideoId = shallowRef<string | null>(null)
  const recorder = options.demo ? null : options.recorder
  const SOURCE: VideoSource = 'feed'

  function isSaved(videoId: string): boolean {
    return isSavedIn(options.events(), videoId)
  }

  return {
    activeVideoId,
    play(videoId) {
      activeVideoId.value = videoId
    },
    stop() {
      activeVideoId.value = null
    },
    syncShown() {
      const id = activeVideoId.value
      if (id !== null && !options.shown(id)) activeVideoId.value = null
    },
    onPlaying(video) {
      recorder?.recordPlay(video.videoId, SOURCE)
    },
    onProgress(video, seconds) {
      recorder?.recordProgress(video.videoId, seconds, video.durationSeconds, SOURCE)
    },
    toggleSave(video) {
      if (!recorder) return
      const next = !isSaved(video.videoId)
      recorder.recordSave(video.videoId, next, SOURCE, next ? snapshotOf(video) : null)
    },
    onSkipped(videoId) {
      if (!recorder || !options.shown(videoId) || activeVideoId.value === videoId) return
      const combined = combineSources(options.events().filter((e) => e.videoId === videoId))
      if (combined && combined.playedAt !== null) return
      recorder.recordSkip(videoId, SOURCE)
    },
    isSaved,
  }
}
