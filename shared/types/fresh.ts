import type { Level } from './skill-tree'
import type { GoalClass, VideoEvent, VideoStyle } from './video'

/** Normalized hobby and language of one Fresh check. */
export interface CheckKey { hobby: string; language: string }
/** One entry of a channel's public feed. */
export interface FeedEntry { videoId: string; title: string; channelId: string; publishedMs: number }
/** Card details kept with a feed save so the Saved chip can show it later. */
export interface SaveSnapshot {
  videoId: string
  title: string
  channel: string
  channelId: string | null
  thumbnailUrl: string
  durationSeconds: number
}
/** `changedAt` is epoch ms. */
export interface ChannelMute { channelId: string; muted: boolean; changedAt: number }

export interface FreshPathSkill { id: string; title: string; level: Level }
export interface FreshPath {
  id: string
  /** paths.hobby_id for cloud paths; null for request paths (id is the hobby id). */
  hobbyId: string | null
  hobby: string
  /** 'none' for signed-out. */
  goalClass: GoalClass
  currentSkillId: string | null
  /** Current_Window in path order, Current_Skill first. */
  windowSkillIds: string[]
  /** Path order. */
  skills: FreshPathSkill[]
  /** Epoch ms, later of last open and last progress save. */
  activeAt: number | null
}
export interface SkillMatch { pathId: string; skillId: string }
interface CardBase {
  videoId: string
  title: string
  channel: string
  channelId: string | null
  thumbnailUrl: string
  durationSeconds: number
  style: VideoStyle
  poolLanguage: string
  matches: SkillMatch[]
}
export interface FreshItemCard extends CardBase {
  kind: 'fresh'
  why: string
  publishedMs: number
  teachesThisSkill: number
  levelFit: number
  level: Level
}
export interface PoolCard extends CardBase { kind: 'pool' }
/** `videos` are ranked. */
export interface FreshSkillPool { pathId: string; skillId: string; videos: PoolCard[] }
export interface FreshSource { hobby: string; language: string; channelId: string; channelName: string }
export interface FreshCheckTime { hobby: string; language: string; lastSuccessMs: number }

export interface FreshResponseOk {
  /** Db clock, epoch ms. */
  nowMs: number
  language: string
  paths: FreshPath[]
  items: FreshItemCard[]
  pools: FreshSkillPool[]
  sources: FreshSource[]
  checkTimes: FreshCheckTime[]
  /** Signed in only. */
  mutes: ChannelMute[]
  /** Signed in only. */
  events: VideoEvent[]
}
export type FreshResponse =
  | FreshResponseOk
  | { error: 'invalid_input' | 'unauthorized' | 'rate_limited'; field?: string }
export interface FreshRequestPath { id: string; hobby: string; skills: FreshPathSkill[]; currentSkillId: string | null }
export interface FreshRequest { language: string; paths: FreshRequestPath[] }
/** Input of `rankFreshItems`. `paths` iterate in response order (bestMatch tie-break). */
export interface RankContext {
  nowMs: number
  paths: ReadonlyMap<string, FreshPath>
  selectedPathId: string
  /** Taste_Adjustment per channel id; empty in Demo_Mode. */
  taste: ReadonlyMap<string, number>
}
/** A Fresh_Item with its chosen Path_Match and Fresh_Score. */
export interface RankedFreshItem {
  item: FreshItemCard
  match: SkillMatch
  closeness: number
  score: number
}
