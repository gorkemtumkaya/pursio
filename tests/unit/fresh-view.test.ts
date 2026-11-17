// Examples for the pure Fresh view (spec: fresh-v2, Req 3, 5, 8; spec: fresh, Req 9.7 to 9.10,
// 14.6, 18.3). The scenario rows of fresh-v2 are in fresh-v2-view.test.ts.
import { describe, expect, it } from 'vitest'
import type { FreshItemCard, FreshResponseOk, SaveSnapshot } from '../../shared/types/fresh'
import type { VideoEvent } from '../../shared/types/video'
import { TASTE_BOUND, tasteAdjustments } from '../../shared/utils/fresh-rank'
import {
  buildFreshView,
  hobbyLetter,
  isAllowedThumbnail,
  relativeTime,
  type FreshView,
  type FreshViewInput,
} from '../../shared/utils/fresh-view'
import { applySave, newEvent } from '../../shared/utils/video-events'
import { HOUR, NOW, freshItem, freshPath, freshResponse, poolCard } from '../support/fresh-client'

function response(over: Partial<FreshResponseOk> = {}): FreshResponseOk {
  return freshResponse({
    paths: [freshPath('a', 'Bouldering', 's1', NOW - 5 * HOUR), freshPath('b', 'Guitar', 's2', NOW - HOUR, { colorSlot: 2 })],
    pools: [
      { pathId: 'a', skillId: 'a-s1', videos: [poolCard('pa1'), poolCard('pa2')] },
      { pathId: 'b', skillId: 'b-s2', videos: [poolCard('pb1')] },
    ],
    ...over,
  })
}

function input(over: Partial<FreshViewInput> = {}): FreshViewInput {
  return { response: response(), chip: { kind: 'all' }, mutes: new Map(), events: [], demo: false, ...over }
}

const cardIds = (view: FreshView, pathId: string): string[] =>
  view.sections.find((s) => s.pathId === pathId)?.cards.map((c) => c.card.videoId) ?? []

describe('buildFreshView', () => {
  it('uses the top Fresh_Item as hero and keeps it out of every section', () => {
    const res = response({ items: [freshItem('f1', 'a', 's1'), freshItem('f2', 'b', 's2', { teachesThisSkill: 0.5 })] })
    const view = buildFreshView(input({ response: res }))
    expect(view.hero).toMatchObject({ kind: 'fresh', badge: 'today', skillTitle: 'Bouldering s1', isCurrentSkill: true })
    expect(view.hero?.path).toEqual({ pathId: 'a', hobby: 'Bouldering', letter: 'B', colorSlot: 1 })
    // Guitar was active last, so its section comes first.
    expect(view.sections.map((s) => s.pathId)).toEqual(['b', 'a'])
    expect(cardIds(view, 'b')).toEqual(['f2', 'pb1'])
    expect(cardIds(view, 'a')).toEqual(['pa1', 'pa2'])
    expect(view.quietLine).toBe(false)
    expect(view.state).toBe('content')
  })

  it('falls back to the pool hero of the first path in Path_Order, then walks on when channels are muted', () => {
    const v1 = buildFreshView(input())
    // Guitar is first in Path_Order.
    expect(v1.hero).toMatchObject({ kind: 'pool', badge: 'best', isCurrentSkill: true })
    expect(v1.hero?.card.videoId).toBe('pb1')
    expect(v1.quietLine).toBe(true)
    expect(cardIds(v1, 'b')).toEqual([])
    const v2 = buildFreshView(input({ mutes: new Map([['ch-pb1', true]]) }))
    expect(v2.hero?.card.videoId).toBe('pa1')
    expect(cardIds(v2, 'a')).toEqual(['pa2'])
    const v3 = buildFreshView(input({ mutes: new Map([['ch-pb1', true], ['ch-pa1', true], ['ch-pa2', true]]) }))
    expect(v3.hero).toBeNull()
    expect(v3.state).toBe('empty')
    expect(v3.sections.map((s) => s.state)).toEqual(['empty', 'empty'])
  })

  it('muting walks to the next Fresh_Item, then the pool fallback, then hides the Hero_Card', () => {
    const res = response({
      paths: [freshPath('a', 'Bouldering', 's1')],
      items: [freshItem('f1', 'a', 's1', { channelId: 'c1' }), freshItem('f2', 'a', 's1', { channelId: 'c2', teachesThisSkill: 0.5 })],
      pools: [{ pathId: 'a', skillId: 'a-s1', videos: [poolCard('p1', 'cp1')] }],
    })
    const mutes = new Map<string, boolean>()
    const hero = () => buildFreshView(input({ response: res, mutes: new Map(mutes) })).hero
    expect(hero()?.card.videoId).toBe('f1')
    mutes.set('c1', true)
    expect(hero()?.card.videoId).toBe('f2')
    mutes.set('c2', true)
    expect(hero()).toMatchObject({ kind: 'pool', badge: 'best' })
    expect(hero()?.card.videoId).toBe('p1')
    mutes.set('cp1', true)
    expect(hero()).toBeNull()
    // Unmuting brings the first hero back.
    mutes.set('c1', false)
    expect(hero()?.card.videoId).toBe('f1')
  })

  it('drops items older than 7 days and hides the hero for Saved', () => {
    const res = response({ items: [freshItem('old', 'a', 's1', { publishedMs: NOW - 7 * 24 * HOUR })] })
    const view = buildFreshView(input({ response: res }))
    expect(view.hero?.kind).toBe('pool')
    expect(view.sections.flatMap((s) => s.cards).some((c) => c.kind === 'fresh')).toBe(false)
    const saved = buildFreshView(input({ response: res, chip: { kind: 'saved' } }))
    expect(saved.hero).toBeNull()
    expect(saved.sections).toEqual([])
    expect(saved.state).toBe('saved_empty')
  })

  it('shows a video once: a pool copy of a Fresh_Item or of the hero is left out', () => {
    // f1 is the hero and f2 a card; both also sit in the pool of the same Skill.
    const res = response({
      paths: [freshPath('a', 'Bouldering', 's1')],
      items: [freshItem('f1', 'a', 's1'), freshItem('f2', 'a', 's1', { teachesThisSkill: 0.5 })],
      pools: [{ pathId: 'a', skillId: 'a-s1', videos: [poolCard('f1'), poolCard('f2'), poolCard('p1')] }],
    })
    const view = buildFreshView(input({ response: res }))
    expect(view.hero?.card.videoId).toBe('f1')
    expect(view.sections[0]?.cards.map((c) => [c.card.videoId, c.kind])).toEqual([
      ['f2', 'fresh'],
      ['p1', 'pool'],
    ])
    // A pool hero is not repeated either.
    const pooled = buildFreshView(input({ response: { ...res, items: [] } }))
    expect(pooled.hero?.card.videoId).toBe('f1')
    expect(cardIds(pooled, 'a')).toEqual(['f2', 'p1'])
  })

  it('a video in two pools shows in the first section only', () => {
    const res = response({
      pools: [
        { pathId: 'a', skillId: 'a-s1', videos: [poolCard('shared'), poolCard('pa2')] },
        { pathId: 'b', skillId: 'b-s2', videos: [poolCard('pb1'), poolCard('shared')] },
      ],
    })
    const view = buildFreshView(input({ response: res }))
    expect(view.hero?.card.videoId).toBe('pb1')
    expect(cardIds(view, 'b')).toEqual(['shared'])
    expect(cardIds(view, 'a')).toEqual(['pa2'])
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
    expect(view.state).toBe('content')
  })

  it('groups sources per path in Path_Order, sorted case-insensitively, one per channel id', () => {
    const res = response({
      sources: [
        { hobby: 'bouldering', language: 'en', channelId: 'c2', channelName: 'beta' },
        { hobby: 'bouldering', language: 'en', channelId: 'c1', channelName: 'Alpha' },
        { hobby: 'bouldering', language: 'en', channelId: 'c1', channelName: 'Alpha' },
      ],
      checkTimes: [{ hobby: 'guitar', language: 'en', lastSuccessMs: NOW - 2 * HOUR }],
    })
    const view = buildFreshView(input({ response: res, mutes: new Map([['c2', true]]) }))
    expect(view.sources.map((g) => [g.key, g.pathId, g.hobby, g.colorSlot])).toEqual([
      ['b', 'b', 'Guitar', 2],
      ['a', 'a', 'Bouldering', 1],
    ])
    expect(view.sources[1]?.entries).toEqual([
      { channelId: 'c1', channelName: 'Alpha', muted: false },
      { channelId: 'c2', channelName: 'beta', muted: true },
    ])
    expect(view.sources[0]?.entries).toEqual([])
    // Guitar has no channel, so the first group that can open is Bouldering's.
    expect(view.defaultOpenSource).toBe('a')
    // "Updated" follows the paths in Scope (Req 1.2).
    expect(view.updatedMs).toBe(NOW - 2 * HOUR)
    const bouldering = buildFreshView(input({ response: res, chip: { kind: 'path', pathId: 'a' } }))
    expect(bouldering.updatedMs).toBeNull()
    expect(bouldering.defaultOpenSource).toBe('a')
    // The selected hobby has no channel: nothing opens by default.
    expect(buildFreshView(input({ response: res, chip: { kind: 'path', pathId: 'b' } })).defaultOpenSource).toBeNull()
    expect(buildFreshView(input({ response: res, chip: { kind: 'saved' } })).updatedMs).toBe(NOW - 2 * HOUR)
  })

  it('keeps one entry for a repeated path id', () => {
    const res = response({ paths: [freshPath('a', 'Bouldering', 's1'), freshPath('a', 'Bouldering again', 's1')] })
    const view = buildFreshView(input({ response: res }))
    expect(view.sections.map((s) => s.hobby)).toEqual(['Bouldering'])
    expect(view.sources).toHaveLength(1)
    expect(view.chips.map((c) => c.key)).toEqual(['all', 'saved'])
  })
})

describe('Skill cap (Req 5.5)', () => {
  // Window of path "a" is a-s1 (current) then a-s3; channels differ so the variety rule changes nothing.
  const paths = [freshPath('a', 'Bouldering', 's1')]
  const pools = [
    { pathId: 'a', skillId: 'a-s1', videos: ['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => poolCard(id)) },
    { pathId: 'a', skillId: 'a-s3', videos: ['q1', 'q2', 'q3', 'q4'].map((id) => poolCard(id)) },
  ]
  const s1Items = ['n1', 'n2'].map((id, i) => freshItem(id, 'a', 's1', { publishedMs: NOW - (i + 1) * HOUR }))
  const ofSkill = (v: FreshView, skillId: string): string[] =>
    [
      ...(v.hero ? [{ id: v.hero.card.videoId, skillId: v.hero.match.skillId }] : []),
      ...v.sections.flatMap((s) => s.cards.map((c) => ({ id: c.card.videoId, skillId: c.match.skillId }))),
    ]
      .filter((c) => c.skillId === skillId)
      .map((c) => c.id)

  it('counts in display order: the hero and the Fresh_Items use a Skill\'s slots before the pool does', () => {
    const v = buildFreshView(input({ response: response({ paths, items: s1Items, pools }) }))
    expect(v.hero?.card.videoId).toBe('n1')
    expect(ofSkill(v, 'a-s1')).toEqual(['n1', 'n2', 'p1'])
    expect(cardIds(v, 'a')).toEqual(['n2', 'p1', 'q1', 'q2', 'q3'])
  })

  it('gives the free slots to the next window Skill, up to 3 each', () => {
    const v = buildFreshView(input({ response: response({ paths, pools }) }))
    expect(ofSkill(v, 'a-s1')).toEqual(['p1', 'p2', 'p3'])
    expect(ofSkill(v, 'a-s3')).toEqual(['q1', 'q2', 'q3'])
  })

  it('applies the cap under a Hobby_Chip too', () => {
    const two = [...paths, freshPath('b', 'Guitar', 's2')]
    const v = buildFreshView(input({ response: response({ paths: two, pools }), chip: { kind: 'path', pathId: 'a' } }))
    expect(v.sections.map((s) => s.pathId)).toEqual(['a'])
    expect(ofSkill(v, 'a-s1')).toEqual(['p1', 'p2', 'p3'])
  })

  it('holds at most 12 cards in a section', () => {
    const wide = { ...freshPath('w', 'Wide', 's1') }
    wide.skills = Array.from({ length: 8 }, (_, i) => ({ id: `w-s${i + 1}`, title: `Wide s${i + 1}`, level: 'beginner' as const }))
    wide.windowSkillIds = wide.skills.map((s) => s.id)
    const many = wide.skills.map((s) => ({
      pathId: 'w',
      skillId: s.id,
      videos: [1, 2, 3].map((n) => poolCard(`${s.id}-v${n}`)),
    }))
    const v = buildFreshView(input({ response: response({ paths: [wide], pools: many }) }))
    // 24 candidates, 3 per Skill: the hero and 12 cards show.
    expect(v.hero?.card.videoId).toBe('w-s1-v1')
    expect(v.sections[0]?.cards).toHaveLength(12)
  })
})

describe('variety over the whole section (Req 5.6, D-B)', () => {
  it('moves a third card of one channel back, even behind a pool card', () => {
    const paths = [freshPath('a', 'Bouldering', 's1')]
    const same = (id: string, skill: string, hours: number): FreshItemCard =>
      freshItem(id, 'a', skill, { channelId: 'UCsame', publishedMs: NOW - hours * HOUR })
    const res = response({
      paths,
      // The hero and three more items of one channel, on two Skills.
      items: [same('n1', 's1', 1), same('n2', 's1', 2), same('n3', 's2', 3), same('n4', 's2', 4)],
      pools: [{ pathId: 'a', skillId: 'a-s3', videos: ['q1', 'q2', 'q3'].map((id) => poolCard(id)) }],
    })
    const v = buildFreshView(input({ response: res }))
    expect(v.hero?.card.videoId).toBe('n1')
    // n2, n3 fit; n4 would be the third of its channel in the window and waits for a free place.
    expect(cardIds(v, 'a')).toEqual(['n2', 'n3', 'q1', 'q2', 'q3', 'n4'])
  })
})

describe('taste (fresh Req 9.7 to 9.10)', () => {
  const channelOf = (id: string): string | null => (id.startsWith('x') ? 'cx' : null)
  const event = (videoId: string, over: Partial<VideoEvent> = {}): VideoEvent => ({ ...newEvent(videoId, 'feed', 0), ...over })
  const snap = (videoId: string, channelId: string): SaveSnapshot => ({
    videoId,
    title: videoId,
    channel: 'c',
    channelId,
    thumbnailUrl: '',
    durationSeconds: 60,
  })
  const paths = [freshPath('a', 'Bouldering', 's1')]
  const items = [freshItem('i1', 'a', 's1', { channelId: 'cs' }), freshItem('i2', 'a', 's1', { channelId: 'ct' })]

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
    const res = response({ paths, items, pools: [] })
    const events = [
      ...Array.from({ length: 7 }, (_, i) => event(`f${i}`)),
      ...['y1', 'y2', 'y3'].map((id) => event(id, { skipped: true, snapshot: snap(id, 'cs'), snapshotAt: 1 })),
    ]
    const plain = buildFreshView(input({ response: res }))
    expect(plain.hero?.card.videoId).toBe('i1')
    const tasted = buildFreshView(input({ response: res, events }))
    expect(tasted.hero?.card.videoId).toBe('i2')
    expect(cardIds(tasted, 'a')).toEqual(['i1'])
    // Demo_Mode: every Taste_Adjustment is 0.
    expect(buildFreshView(input({ response: res, events, demo: true })).hero?.card.videoId).toBe('i1')
  })

  it('ignores skill_sheet skips in the view ranking', () => {
    const res = response({ paths, items, pools: [] })
    const events = [
      ...Array.from({ length: 7 }, (_, i) => event(`f${i}`)),
      ...['y1', 'y2', 'y3'].map((id) =>
        event(id, { source: 'skill_sheet', skipped: true, snapshot: snap(id, 'cs'), snapshotAt: 1 }),
      ),
    ]
    expect(buildFreshView(input({ response: res, events })).hero?.card.videoId).toBe('i1')
  })
})

describe('hobbyLetter, relativeTime and isAllowedThumbnail', () => {
  it('takes the first letter of the trimmed hobby, upper-cased', () => {
    expect(hobbyLetter('bouldering')).toBe('B')
    expect(hobbyLetter('  film photography ')).toBe('F')
    expect(hobbyLetter('étude')).toBe('É')
    expect(hobbyLetter('3D printing')).toBe('3')
    // One code point, not half of a surrogate pair.
    expect(hobbyLetter('𝒳 marks')).toBe('𝒳')
    expect(hobbyLetter('   ')).toBe('?')
    expect(hobbyLetter('')).toBe('?')
  })

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
