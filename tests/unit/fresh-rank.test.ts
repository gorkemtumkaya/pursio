import { describe, expect, it } from 'vitest'
import type { FreshItemCard, FreshPath } from '../../shared/types/fresh'
import type { VideoEvent } from '../../shared/types/video'
import {
  arrangeVariety,
  bestMatch,
  closenessFactor,
  freshScore,
  rankFreshItems,
  recencyFactor,
  tasteAdjustments,
} from '../../shared/utils/fresh-rank'
import { newEvent } from '../../shared/utils/video-events'

function path(id: string, currentSkillId: string | null, goalClass: FreshPath['goalClass'] = 'none'): FreshPath {
  const skills = ['s1', 's2', 's3', 's4'].map((s) => ({ id: `${id}-${s}`, title: s, level: 'beginner' as const }))
  return {
    id,
    hobbyId: null,
    hobby: 'bouldering',
    goalClass,
    currentSkillId: currentSkillId === null ? null : `${id}-${currentSkillId}`,
    windowSkillIds: currentSkillId === null ? [] : [`${id}-s2`, `${id}-s3`],
    skills,
    activeAt: null,
  }
}

function item(videoId: string, over: Partial<FreshItemCard> = {}): FreshItemCard {
  return {
    kind: 'fresh',
    videoId,
    title: videoId,
    channel: 'Chan',
    channelId: 'c1',
    thumbnailUrl: '',
    durationSeconds: 1200,
    style: 'explainer',
    poolLanguage: 'en',
    matches: [{ pathId: 'a', skillId: 'a-s2' }],
    why: '',
    publishedMs: 0,
    teachesThisSkill: 1,
    levelFit: 1,
    level: 'beginner',
    ...over,
  }
}

function event(videoId: string, over: Partial<VideoEvent> = {}): VideoEvent {
  return { ...newEvent(videoId, 'feed', 0), ...over }
}

describe('recencyFactor', () => {
  it('is 1 at age 0 and for future times, 0.5 at 7 days', () => {
    expect(recencyFactor(0)).toBe(1)
    expect(recencyFactor(-100)).toBe(1)
    expect(recencyFactor(604800)).toBe(0.5)
    expect(recencyFactor(604799)).toBeGreaterThan(0.5)
  })
})

describe('closenessFactor', () => {
  const p = path('a', 's2')
  it('gives 1.0, 0.8 and 0.6 against the own path', () => {
    expect(closenessFactor({ pathId: 'a', skillId: 'a-s2' }, p)).toBe(1)
    expect(closenessFactor({ pathId: 'a', skillId: 'a-s3' }, p)).toBe(0.8)
    expect(closenessFactor({ pathId: 'a', skillId: 'a-s4' }, p)).toBe(0.6)
  })
  it('gives 0.6 on a path with no Current_Skill', () => {
    expect(closenessFactor({ pathId: 'b', skillId: 'b-s1' }, path('b', null))).toBe(0.6)
  })
})

describe('bestMatch', () => {
  const paths = new Map([['a', path('a', 's2')], ['b', path('b', 's2')], ['c', path('c', 's2')]])
  it('picks the highest closeness', () => {
    const r = bestMatch([{ pathId: 'a', skillId: 'a-s4' }, { pathId: 'b', skillId: 'b-s2' }], paths, 'a')
    expect(r).toEqual({ match: { pathId: 'b', skillId: 'b-s2' }, closeness: 1 })
  })
  it('breaks ties by Selected_Path, then skill order, then path order', () => {
    expect(bestMatch([{ pathId: 'b', skillId: 'b-s1' }, { pathId: 'c', skillId: 'c-s1' }], paths, 'c')?.match.pathId).toBe('c')
    expect(bestMatch([{ pathId: 'a', skillId: 'a-s4' }, { pathId: 'a', skillId: 'a-s1' }], paths, 'a')?.match.skillId).toBe('a-s1')
    expect(bestMatch([{ pathId: 'c', skillId: 'c-s1' }, { pathId: 'b', skillId: 'b-s1' }], paths, 'a')?.match.pathId).toBe('b')
  })
  it('ignores matches outside the paths and returns null when none remain', () => {
    expect(bestMatch([{ pathId: 'z', skillId: 'z-s1' }, { pathId: 'a', skillId: 'nope' }], paths, 'a')).toBeNull()
  })
})

describe('tasteAdjustments', () => {
  const channelOf = (id: string): string | null => (id.startsWith('x') ? 'cx' : null)
  it('is empty under 10 records', () => {
    const events = Array.from({ length: 9 }, (_, i) => event(`x${i}`, { finished: true }))
    expect(tasteAdjustments(events, channelOf).size).toBe(0)
  })
  it('adds +0.1 for Finished and −0.1 for 3 feed skips; skill_sheet skips do not count', () => {
    const filler = Array.from({ length: 6 }, (_, i) => event(`f${i}`))
    const snap = { videoId: 'y1', title: '', channel: '', channelId: 'cy', thumbnailUrl: '', durationSeconds: 0 }
    const events = [
      ...filler,
      event('x1', { finished: true }),
      event('y1', { skipped: true, snapshot: snap, snapshotAt: 1 }),
      event('y2', { skipped: true, snapshot: { ...snap, videoId: 'y2' }, snapshotAt: 1 }),
      event('y3', { skipped: true, snapshot: { ...snap, videoId: 'y3' }, snapshotAt: 1 }),
      event('x2', { skipped: true, source: 'skill_sheet' }),
      event('x3', { skipped: true, source: 'skill_sheet' }),
      event('x4', { skipped: true, source: 'skill_sheet' }),
    ]
    const taste = tasteAdjustments(events, channelOf)
    expect(taste.get('cx')).toBe(0.1)
    expect(taste.get('cy')).toBe(-0.1)
  })
})

describe('freshScore and rankFreshItems', () => {
  it('adds goal adjustment and taste to the product', () => {
    const it1 = item('v', { teachesThisSkill: 0.8, levelFit: 0.5, style: 'drill' })
    expect(freshScore(it1, { nowMs: 0, closeness: 0.8, goal: 'targeted', taste: -0.1 })).toBeCloseTo(0.8 * 0.5 * 0.8 + 0.1 - 0.1)
  })
  it('orders by score desc, published desc, id asc and carries the chosen match', () => {
    const paths = new Map([['a', path('a', 's2')]])
    const items = [
      item('b', { publishedMs: 0 }),
      item('a', { publishedMs: 0 }),
      item('c', { publishedMs: 0, matches: [{ pathId: 'a', skillId: 'a-s4' }] }),
      item('d', { publishedMs: 0, matches: [{ pathId: 'z', skillId: 'z-s1' }] }),
    ]
    const ranked = rankFreshItems(items, { nowMs: 0, paths, selectedPathId: 'a', taste: new Map() })
    expect(ranked.map((r) => r.item.videoId)).toEqual(['a', 'b', 'c'])
    expect(ranked[0]?.match).toEqual({ pathId: 'a', skillId: 'a-s2' })
    expect(ranked[2]?.closeness).toBe(0.6)
  })
})

describe('arrangeVariety', () => {
  // Cards are "<channel><n>"; channel "_" means null.
  const channelOf = (card: string): string | null => (card[0] === '_' ? null : card[0]!)

  it('keeps a section that already fits', () => {
    const cards = ['a1', 'b1', 'a2', 'c1', 'b2', 'd1']
    expect(arrangeVariety(cards, channelOf)).toEqual({ cards, tailStart: 6 })
  })

  it('moves a third card of a channel to the first later position that fits', () => {
    const cards = ['a1', 'a2', 'a3', 'b1', 'c1', 'd1', 'e1', 'f1']
    // a3 first fits at index 6, where the window of indices 1 to 6 holds only a2 and a3.
    expect(arrangeVariety(cards, channelOf)).toEqual({
      cards: ['a1', 'a2', 'b1', 'c1', 'd1', 'e1', 'a3', 'f1'],
      tailStart: 8,
    })
  })

  it('places cards that never fit at the end in ranked order', () => {
    const cards = ['a1', 'a2', 'a3', 'a4', 'b1']
    expect(arrangeVariety(cards, channelOf)).toEqual({
      cards: ['a1', 'a2', 'b1', 'a3', 'a4'],
      tailStart: 3,
    })
  })

  it('never counts a null channel as a conflict', () => {
    const cards = ['_1', '_2', '_3', '_4']
    expect(arrangeVariety(cards, channelOf)).toEqual({ cards, tailStart: 4 })
  })

  it('handles an empty section', () => {
    expect(arrangeVariety([], channelOf)).toEqual({ cards: [], tailStart: 0 })
  })
})
