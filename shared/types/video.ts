import type { Level } from './skill-tree'

export type GoalClass = 'targeted' | 'casual' | 'none'
export type VideoStyle = 'drill' | 'technique' | 'explainer' | 'approachable'
export type VideoSource = 'skill_sheet' | 'feed'

export interface PoolVideo {
  id: string
  title: string
  channel: string
  thumbnailUrl: string
  durationSeconds: number
  viewCount: number | null
  likeCount: number | null
  publishedAt: string | null
  defaultAudioLanguage: string | null
  hasCaptions: boolean | null
  teachesThisSkill: number
  levelFit: number
  style: VideoStyle
  matchedQuestText: string | null
}

/** `storedAt` is epoch ms. */
export interface VideoPool {
  poolKey: string
  videos: PoolVideo[]
  storedAt: number
}

export interface RankedVideo {
  id: string
  title: string
  channel: string
  thumbnailUrl: string
  durationSeconds: number
  style: VideoStyle
  matchedQuestText: string | null
  /** Language_Code of the pool the video came from. */
  poolLanguage: string
}

export interface VideosRequest {
  hobby: string
  skillTitle: string
  level: Level
  /** null or empty means not chosen, so 'en'. */
  language: string | null
  /** Required for a Signed_In_User, ignored otherwise. */
  pathId?: string
  /** Required for a Signed_In_User, ignored otherwise. */
  skillId?: string
}

/** What the Watch section shows for one skill. */
export type SkillVideosState =
  | { kind: 'hidden' }
  /** Signed in, a fill is in progress and there are 0 videos. */
  | { kind: 'finding' }
  /** Up to 12 videos in server order; `language` is the user's Language_Code. */
  | { kind: 'ready'; videos: RankedVideo[]; language: string }

export type VideosResponse =
  | { videos: RankedVideo[]; fillInProgress: boolean }
  | { error: 'invalid_input' | 'unauthorized' | 'rate_limited'; field?: string }

export interface VideoEvent {
  videoId: string
  source: VideoSource
  /** Epoch ms of the first play, set once. */
  playedAt: number | null
  /** >= 0, never decreases. */
  watchedSeconds: number
  /** Sticky. */
  finished: boolean
  saved: boolean
  /** Saved_Time: time of the last save or unsave; null is earlier than every time. */
  savedAt: number | null
  skipped: boolean
  /** Epoch ms of the last change. */
  updatedAt: number
}
