import { describe, expect, it } from 'vitest'
import type { FreshItemCard, FreshPath, FreshResponseOk, PoolCard } from '../../shared/types/fresh'
import type { VideoEvent } from '../../shared/types/video'
import { buildFreshView, isAllowedThumbnail, relativeTime, type FreshViewInput } from '../../shared/utils/fresh-view'
import { applySave, newEvent } from '../../shared/utils/video-events'

const NOW = Date.UTC(2026, 10, 20, 12)
const HOUR = 3600_000

function path(id: string, hobby: string, current: string | null, activeAt: number | null = null): FreshPath {
  const skills = ['s1', 's2', 's3'].map((s) => ({ id: `${id}-${s}`, title: `${hobby} ${s}`, level: 'beginner' as const }))
  return {
    id,
    hobbyId: null,
    hobby,
    goalClass: 'none',
    currentSkillId: current === null ? null : `${id}-${current}`,
    windowSkillIds: current === null ? [] : [`${id}-${current}`, `${id}-s3`],
    skills,
    activeAt,
  }
}

function item(videoId: string, pathId: string, skill: string, over: Partial<FreshItemCard> = {}): FreshItemCard {
  return {
    kind: 'fresh',
    videoId,
    title: `t ${videoId}`,
    channel: 'c',
    channelId: `ch-${videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hq.jpg`,
    durationSeconds: 300,
    style: 'technique',
    poolLanguage: 'en',
    matches: [{ pathId, skillId: `${pathId}-${skill}` }],
    why: 'why',
    publishedMs: NOW - HOUR,
    teachesThisSkill: 0.9,
    levelFit: 0.9,
    level: 'beginner',
    ...over,
  }
}

function pool(videoId: string, channelId: string | null = `ch-${videoId}`): PoolCard {
  return {
    kind: 'pool',
    videoId,
    title: `p ${videoId}`,
    channel: 'c',
    channelId,
    thumbnailUrl: 'https://i.ytimg.com/x.jpg',
    durationSeconds: 300,
    style: 'technique',
    poolLanguage: 'en',
    matches: [],
  }
}

function response(over: Partial<FreshResponseOk> = {}): FreshResponseOk {
  return {
    nowMs: NOW,
    language: 'en',
    paths: [path('a', 'Bouldering', 's1', NOW - 5 * HOUR), path('b', 'Guitar', 's2', NOW - HOUR)],
    items: [],
    pools: [
      { pathId: 'a', skillId: 'a-s1', videos: [pool('pa1'), pool('pa2')] },
      { pathId: 'b', skillId: 'b-s2', videos: [pool('pb1')] },
    ],
    sources: [],
    checkTimes: [],
    mutes: [],
    events: [],
    ...over,
  }
}

function input(over: Partial<FreshViewInput> = {}): FreshViewInput {
  return { response: response(), chip: { kind: 'all' }, selectedPathId: null, mutes: new Map(), events: [], demo: false, ...over }
}

describe('buildFreshView', () => {
  it('uses the top Fresh_Item as hero and keeps it out of both sections', () => {
    const res = response({ items: [item('f1', 'a', 's1'), item('f2', 'b', 's2', { teachesThisSkill: 0.5 })] })
    const view = buildFreshView(input({ response: res }))
    expect(view.hero?.kind).toBe('fresh')
    expect(view.hero?.label).toBe('New for Bouldering s1')
    expect(view.newCards.map((c) => c.card.videoId)).toEqual(['f2'])
    expect(view.bestCards.map((c) => c.card.videoId)).toEqual(['pa1', 'pa2', 'pb1'])
    expect(view.quietLine).toBe(false)
    expect(view.headerLabel).toBe('All hobbies')
  })

  it('falls back to the pool hero, then walks on when its channel is muted', () => {
    const v1 = buildFreshView(input())
    expect(v1.hero?.kind).toBe('pool')
    expect(v1.hero?.label).toBe('Best for your current skill')
    expect(v1.hero?.card.videoId).toBe('pa1')
    expect(v1.quietLine).toBe(true)
    const v2 = buildFreshView(input({ mutes: new Map([['ch-pa1', true], ['ch-pa2', true]]) }))
    expect(v2.hero).toBeNull()
    expect(v2.bestCards.map((c) => c.card.videoId)).toEqual(['pb1'])
  })

  it('drops items older than 7 days and hides the hero for Saved', () => {
    const res = response({ items: [item('old', 'a', 's1', { publishedMs: NOW - 7 * 24 * HOUR })] })
    expect(buildFreshView(input({ response: res })).newCards).toEqual([])
    const saved = buildFreshView(input({ response: res, chip: { kind: 'saved' } }))
    expect(saved.hero).toBeNull()
    expect(saved.state).toBe('saved_empty')
  })

  it('hides "For <skill>" without a Current_Skill and "Saved" in Demo_Mode', () => {
    const res = response({ paths: [path('a', 'Bouldering', null)] })
    const view = buildFreshView(input({ response: res, chip: { kind: 'current' }, demo: true }))
    expect(view.chips.map((c) => c.label)).toEqual(['All skills', 'Bouldering'])
    expect(view.chip).toEqual({ kind: 'all' })
    expect(view.headerLabel).toBe('Bouldering')
    expect(view.state).toBe('empty')
  })

  it('lists saved snapshots by Saved_Time descending', () => {
    const snap = (id: string) => ({ videoId: id, title: id, channel: 'c', channelId: `ch-${id}`, thumbnailUrl: 'http://i.ytimg.com/x', durationSeconds: 60 })
    const events: VideoEvent[] = [
      applySave(newEvent('x', 'feed', 1), true, 100, snap('x')),
      applySave(newEvent('y', 'feed', 1), true, 200, snap('y')),
      applySave(newEvent('z', 'feed', 1), true, 300),
    ]
    const view = buildFreshView(input({ chip: { kind: 'saved' }, events }))
    expect(view.saved.map((s) => s.videoId)).toEqual(['y', 'x'])
    expect(view.saved[0]?.thumbnailAllowed).toBe(false)
  })

  it('groups sources per hobby, sorted case-insensitively, one per channel id', () => {
    const res = response({
      sources: [
        { hobby: 'bouldering', language: 'en', channelId: 'c2', channelName: 'beta' },
        { hobby: 'bouldering', language: 'en', channelId: 'c1', channelName: 'Alpha' },
        { hobby: 'bouldering', language: 'en', channelId: 'c1', channelName: 'Alpha' },
      ],
      checkTimes: [{ hobby: 'guitar', language: 'en', lastSuccessMs: NOW - 2 * HOUR }],
    })
    const view = buildFreshView(input({ response: res, mutes: new Map([['c2', true]]) }))
    expect(view.sources.map((g) => g.hobby)).toEqual(['Bouldering', 'Guitar'])
    expect(view.sources[0]?.entries).toEqual([
      { channelId: 'c1', channelName: 'Alpha', muted: false },
      { channelId: 'c2', channelName: 'beta', muted: true },
    ])
    expect(view.sources[1]?.entries).toEqual([])
    expect(view.updatedMs).toBe(NOW - 2 * HOUR)
    expect(buildFreshView(input({ response: res, chip: { kind: 'path', pathId: 'a' } })).updatedMs).toBeNull()
  })
})

describe('relativeTime and isAllowedThumbnail', () => {
  it('formats elapsed time', () => {
    expect(relativeTime(NOW, NOW + 5000)).toBe('just now')
    expect(relativeTime(NOW, NOW - 59_000)).toBe('just now')
    expect(relativeTime(NOW, NOW - 60_000)).toBe('1m ago')
    expect(relativeTime(NOW, NOW - HOUR)).toBe('1h ago')
    expect(relativeTime(NOW, NOW - 24 * HOUR)).toBe('1d ago')
  })

  it('allows only https i.ytimg.com', () => {
    expect(isAllowedThumbnail('https://i.ytimg.com/vi/a/hq.jpg')).toBe(true)
    expect(isAllowedThumbnail('http://i.ytimg.com/vi/a/hq.jpg')).toBe(false)
    expect(isAllowedThumbnail('https://evil.com/i.ytimg.com')).toBe(false)
    expect(isAllowedThumbnail('https://i.ytimg.com.evil.com/x')).toBe(false)
    expect(isAllowedThumbnail('not a url')).toBe(false)
  })
})
