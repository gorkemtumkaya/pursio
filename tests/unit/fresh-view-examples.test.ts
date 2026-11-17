/**
 * Taste and hero examples (task 3.17, Req 19.9, 19.11, 19.19) not already covered by
 * fresh-rank.test.ts and fresh-view.test.ts.
 */
import { describe, expect, it } from 'vitest'
import type { FreshItemCard, FreshPath, FreshResponseOk, PoolCard, SaveSnapshot } from '../../shared/types/fresh'
import type { VideoEvent } from '../../shared/types/video'
import { TASTE_BOUND, tasteAdjustments } from '../../shared/utils/fresh-rank'
import { buildFreshView, type FreshViewInput } from '../../shared/utils/fresh-view'
import { newEvent } from '../../shared/utils/video-events'

const NOW = Date.UTC(2026, 10, 20, 12)
const HOUR = 3600_000

function path(id: string, hobby: string, current: string | null): FreshPath {
  const skills = ['s1', 's2', 's3'].map((s) => ({ id: `${id}-${s}`, title: `${hobby} ${s}`, level: 'beginner' as const }))
  return {
    id,
    hobbyId: null,
    hobby,
    goalClass: 'none',
    currentSkillId: current === null ? null : `${id}-${current}`,
    windowSkillIds: current === null ? [] : [`${id}-${current}`, `${id}-s3`],
    skills,
    activeAt: null,
  }
}

function item(videoId: string, channelId: string | null, over: Partial<FreshItemCard> = {}): FreshItemCard {
  return {
    kind: 'fresh',
    videoId,
    title: `t ${videoId}`,
    channel: 'c',
    channelId,
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hq.jpg`,
    durationSeconds: 300,
    style: 'technique',
    poolLanguage: 'en',
    matches: [{ pathId: 'a', skillId: 'a-s1' }],
    why: 'why',
    publishedMs: NOW - HOUR,
    teachesThisSkill: 0.9,
    levelFit: 0.9,
    level: 'beginner',
    ...over,
  }
}

function pool(videoId: string, channelId: string | null): PoolCard {
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
    paths: [path('a', 'Bouldering', 's1')],
    items: [],
    pools: [{ pathId: 'a', skillId: 'a-s1', videos: [pool('p1', 'cp1'), pool('p2', 'cp2')] }],
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

function event(videoId: string, over: Partial<VideoEvent> = {}): VideoEvent {
  return { ...newEvent(videoId, 'feed', 0), ...over }
}

function snap(videoId: string, channelId: string): SaveSnapshot {
  return { videoId, title: videoId, channel: 'c', channelId, thumbnailUrl: '', durationSeconds: 60 }
}

describe('taste examples (Req 19.9)', () => {
  const channelOf = (id: string): string | null => (id.startsWith('x') ? 'cx' : null)

  it('gives 0 with 9 records, even with 3 feed skips of one channel', () => {
    const events = [
      ...Array.from({ length: 6 }, (_, i) => event(`f${i}`)),
      ...Array.from({ length: 3 }, (_, i) => event(`x${i}`, { skipped: true })),
    ]
    expect(events).toHaveLength(9)
    expect(tasteAdjustments(events, channelOf).get('cx') ?? 0).toBe(0)
  })

  it('gives 0 for Finished plus 3 feed skips, and stays within the bound', () => {
    const events = [
      ...Array.from({ length: 6 }, (_, i) => event(`f${i}`)),
      event('x0', { finished: true }),
      ...Array.from({ length: 5 }, (_, i) => event(`x${i + 1}`, { skipped: true })),
    ]
    const taste = tasteAdjustments(events, channelOf)
    expect(taste.get('cx') ?? 0).toBeCloseTo(0)
    for (const v of taste.values()) expect(Math.abs(v)).toBeLessThanOrEqual(TASTE_BOUND)
  })

  it('takes the channel from the Save_Snapshot when the video is in no returned card and lowers its item', () => {
    // Two equal items; channel cs gets 3 feed skips on videos only known by their snapshots.
    const res = response({
      items: [item('i1', 'cs'), item('i2', 'ct')],
      pools: [],
    })
    const events = [
      ...Array.from({ length: 7 }, (_, i) => event(`f${i}`)),
      ...['y1', 'y2', 'y3'].map((id) => event(id, { skipped: true, snapshot: snap(id, 'cs'), snapshotAt: 1 })),
    ]
    const plain = buildFreshView(input({ response: res }))
    expect(plain.hero?.card.videoId).toBe('i1')
    const tasted = buildFreshView(input({ response: res, events }))
    expect(tasted.hero?.card.videoId).toBe('i2')
    expect(tasted.newCards.map((c) => c.card.videoId)).toEqual(['i1'])
    // Demo_Mode: every Taste_Adjustment is 0 (Req 9.15).
    expect(buildFreshView(input({ response: res, events, demo: true })).hero?.card.videoId).toBe('i1')
  })

  it('ignores skill_sheet skips in the view ranking', () => {
    const res = response({ items: [item('i1', 'cs'), item('i2', 'ct')], pools: [] })
    const events = [
      ...Array.from({ length: 7 }, (_, i) => event(`f${i}`)),
      ...['y1', 'y2', 'y3'].map((id) =>
        event(id, { source: 'skill_sheet', skipped: true, snapshot: snap(id, 'cs'), snapshotAt: 1 }),
      ),
    ]
    expect(buildFreshView(input({ response: res, events })).hero?.card.videoId).toBe('i1')
  })
})

describe('hero examples (Req 19.11, 19.19)', () => {
  it('labels a Fresh hero with its chosen Skill and a pool hero with the fallback label', () => {
    const res = response({ items: [item('f1', 'c1', { matches: [{ pathId: 'a', skillId: 'a-s3' }] })] })
    const fresh = buildFreshView(input({ response: res }))
    expect(fresh.hero).toMatchObject({ kind: 'fresh', label: 'New for Bouldering s3', skillTitle: 'Bouldering s3' })
    const pooled = buildFreshView(input())
    expect(pooled.hero).toMatchObject({ kind: 'pool', label: 'Best for your current skill' })
    expect(pooled.hero?.card.videoId).toBe('p1')
  })

  it('muting walks to the next Fresh_Item, then the pool fallback, then hides the Hero_Card', () => {
    const res = response({
      items: [item('f1', 'c1'), item('f2', 'c2', { teachesThisSkill: 0.5 })],
      pools: [{ pathId: 'a', skillId: 'a-s1', videos: [pool('p1', 'cp1')] }],
    })
    const mutes = new Map<string, boolean>()
    expect(buildFreshView(input({ response: res, mutes })).hero?.card.videoId).toBe('f1')
    mutes.set('c1', true)
    expect(buildFreshView(input({ response: res, mutes })).hero?.card.videoId).toBe('f2')
    mutes.set('c2', true)
    const fallback = buildFreshView(input({ response: res, mutes }))
    expect(fallback.hero?.kind).toBe('pool')
    expect(fallback.hero?.card.videoId).toBe('p1')
    mutes.set('cp1', true)
    const none = buildFreshView(input({ response: res, mutes }))
    expect(none.hero).toBeNull()
    expect(none.state).toBe('empty')
    // Unmuting brings the first hero back.
    mutes.set('c1', false)
    expect(buildFreshView(input({ response: res, mutes })).hero?.card.videoId).toBe('f1')
  })

  it('has no fallback when the Hero_Path has no Current_Skill', () => {
    const res = response({
      paths: [path('a', 'Bouldering', null)],
      pools: [{ pathId: 'a', skillId: 'a-s1', videos: [pool('p1', 'cp1')] }],
    })
    expect(buildFreshView(input({ response: res })).hero).toBeNull()
  })

  it('keeps the Hero_Card and New_Section ids out of the Best_Section', () => {
    // f1 is the hero, f2 is in the New_Section; both also sit in the pool.
    const res = response({
      items: [item('f1', 'c1'), item('f2', 'c2', { teachesThisSkill: 0.5 })],
      pools: [{ pathId: 'a', skillId: 'a-s1', videos: [pool('f1', 'c1'), pool('f2', 'c2'), pool('p1', 'cp1')] }],
    })
    const view = buildFreshView(input({ response: res }))
    expect(view.hero?.card.videoId).toBe('f1')
    expect(view.newCards.map((c) => c.card.videoId)).toEqual(['f2'])
    expect(view.bestCards.map((c) => c.card.videoId)).toEqual(['p1'])
  })

  it('keeps a pool hero id out of the Best_Section', () => {
    const view = buildFreshView(input())
    expect(view.hero?.card.videoId).toBe('p1')
    expect(view.bestCards.map((c) => c.card.videoId)).toEqual(['p2'])
  })

  it('hides the Hero_Card on "Saved" even with Fresh_Items in scope', () => {
    const res = response({ items: [item('f1', 'c1')] })
    const view = buildFreshView(input({ response: res, chip: { kind: 'saved' } }))
    expect(view.hero).toBeNull()
    expect(view.newCards).toEqual([])
    expect(view.bestCards).toEqual([])
  })

  it('selects "All skills" by default and when the requested chip is hidden or unknown', () => {
    const two = response({ paths: [path('a', 'Bouldering', 's1'), path('b', 'Guitar', null)] })
    const byDefault = buildFreshView(input({ response: two }))
    expect(byDefault.chips.filter((c) => c.selected).map((c) => c.key)).toEqual(['all'])
    expect(byDefault.chips.map((c) => c.label)).toEqual(['All skills', 'For Bouldering s1', 'Bouldering', 'Guitar', 'Saved'])
    // Path "b" has no Current_Skill: "For <current skill>" is hidden and falls back to "All skills".
    const hidden = buildFreshView(input({ response: two, selectedPathId: 'b', chip: { kind: 'current' } }))
    expect(hidden.chips.map((c) => c.key)).not.toContain('current')
    expect(hidden.chip).toEqual({ kind: 'all' })
    const unknown = buildFreshView(input({ response: two, chip: { kind: 'path', pathId: 'gone' } }))
    expect(unknown.chip).toEqual({ kind: 'all' })
  })
})

describe('Skill cap examples (decision D17, Req 9.16)', () => {
  // Window of path "a" is a-s1 (current) then a-s3; channels differ so the variety rule changes nothing.
  const pools = [
    { pathId: 'a', skillId: 'a-s1', videos: ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => pool(id, `c-${id}`)) },
    { pathId: 'a', skillId: 'a-s3', videos: ['q1', 'q2', 'q3', 'q4'].map((id) => pool(id, `c-${id}`)) },
  ]
  const s1Items = ['n1', 'n2'].map((id, i) => item(id, `c-${id}`, { publishedMs: NOW - (i + 1) * HOUR }))
  const ofSkill = (v: ReturnType<typeof buildFreshView>, skillId: string): string[] =>
    [
      ...(v.hero ? [v.hero] : []).map((h) => ({ id: h.card.videoId, skillId: h.match.skillId })),
      ...v.newCards.map((c) => ({ id: c.card.videoId, skillId: c.match.skillId })),
      ...v.bestCards.map((c) => ({ id: c.card.videoId, skillId: c.match.skillId })),
    ]
      .filter((c) => c.skillId === skillId)
      .map((c) => c.id)

  it('counts in display order: the hero and New use a Skill\'s slots before Best does', () => {
    const v = buildFreshView(input({ response: response({ items: s1Items, pools }) }))
    expect(v.hero?.card.videoId).toBe('n1')
    expect(v.newCards.map((c) => c.card.videoId)).toEqual(['n2'])
    expect(ofSkill(v, 'a-s1')).toEqual(['n1', 'n2', 'p1'])
  })

  it('gives the free slots to the next window Skill, up to 3 each', () => {
    const v = buildFreshView(input({ response: response({ pools }) }))
    expect(ofSkill(v, 'a-s1')).toEqual(['p1', 'p2', 'p3'])
    expect(ofSkill(v, 'a-s3')).toEqual(['q1', 'q2', 'q3'])
  })

  it('applies the cap under a path chip too', () => {
    const v = buildFreshView(input({ response: response({ pools }), chip: { kind: 'path', pathId: 'a' } }))
    expect(ofSkill(v, 'a-s1')).toHaveLength(3)
  })

  it('shows every video of the skill under "For <current skill>"', () => {
    const v = buildFreshView(input({ response: response({ items: s1Items, pools }), chip: { kind: 'current' } }))
    expect(ofSkill(v, 'a-s1')).toEqual(['n1', 'n2', 'p1', 'p2', 'p3', 'p4', 'p5'])
  })
})
