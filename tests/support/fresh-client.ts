// Client-side test helpers for the Fresh_Page (spec: fresh, tasks 13 and 16).
import type { FreshItemCard, FreshPath, FreshResponseOk, PoolCard } from '../../shared/types/fresh'
import type { StorageLike } from '../../app/utils/progress-store'

export interface MemoryStorage extends StorageLike {
  data: Map<string, string>
  /** Number of setItem and removeItem calls. */
  writes: number
}

export function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(initial))
  const storage: MemoryStorage = {
    data,
    writes: 0,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      storage.writes += 1
      data.set(key, value)
    },
    removeItem: (key) => {
      storage.writes += 1
      data.delete(key)
    },
  }
  return storage
}

export const NOW = Date.UTC(2026, 10, 20, 12)
export const HOUR = 3_600_000

/** A path with Skills `<id>-s1..s3`; the window is the current Skill and `s3`. */
export function freshPath(id: string, hobby: string, current: string | null, activeAt: number | null = null): FreshPath {
  const skills = ['s1', 's2', 's3'].map((s) => ({ id: `${id}-${s}`, title: `${hobby} ${s}`, level: 'beginner' as const }))
  return {
    id,
    hobbyId: id,
    hobby,
    goalClass: 'none',
    currentSkillId: current === null ? null : `${id}-${current}`,
    windowSkillIds: current === null ? [] : [`${id}-${current}`, `${id}-s3`],
    skills,
    activeAt,
  }
}

export function freshItem(videoId: string, pathId: string, skill: string, over: Partial<FreshItemCard> = {}): FreshItemCard {
  return {
    kind: 'fresh',
    videoId,
    title: `t ${videoId}`,
    channel: `Channel ${videoId}`,
    channelId: `ch-${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: 300,
    style: 'technique',
    poolLanguage: 'en',
    matches: [{ pathId, skillId: `${pathId}-${skill}` }],
    why: `Why ${videoId}`,
    publishedMs: NOW - HOUR,
    teachesThisSkill: 0.9,
    levelFit: 0.9,
    level: 'beginner',
    ...over,
  }
}

export function poolCard(videoId: string, channelId: string | null = `ch-${videoId}`): PoolCard {
  return {
    kind: 'pool',
    videoId,
    title: `p ${videoId}`,
    channel: `Channel ${videoId}`,
    channelId,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: 300,
    style: 'technique',
    poolLanguage: 'en',
    matches: [],
  }
}

export function freshResponse(over: Partial<FreshResponseOk> = {}): FreshResponseOk {
  return {
    nowMs: NOW,
    language: 'en',
    paths: [],
    items: [],
    pools: [],
    sources: [],
    checkTimes: [],
    mutes: [],
    events: [],
    ...over,
  }
}
