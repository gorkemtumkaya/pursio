// Scenario rows of fresh-v2 as examples (spec: fresh-v2, task 5.8; Req 12.2, 12.3, 12.4, 12.6):
// A1 to A4, B1 to B5, B9 and C1 to C6 of scenarios.md, the hero badges at the 24 h and 7 day
// edges, a New_Item left out by the Skill cap, and the singular header text.
import { describe, expect, it } from 'vitest'
import type { FreshItemCard, FreshPath, FreshResponseOk } from '../../shared/types/fresh'
import { buildFreshView, type FilterChip, type FreshView, type FreshViewInput } from '../../shared/utils/fresh-view'
import { applySave, newEvent } from '../../shared/utils/video-events'
import { freshPageState, newTodayText } from '../../app/utils/fresh-page'
import { HOUR, NOW, freshItem, freshPath, freshResponse, poolCard } from '../support/fresh-client'

const SECOND = 1000

/**
 * Four hobbies. Path_Order is Guitar (1 h ago), Chess (2 h), Bouldering (5 h), Yoga (never).
 * Chess is finished; Yoga has a Current_Skill and no video.
 */
const PATHS: FreshPath[] = [
  freshPath('a', 'Bouldering', 's1', NOW - 5 * HOUR, { colorSlot: 1, completedCount: 0 }),
  freshPath('b', 'Guitar', 's2', NOW - HOUR, { colorSlot: 2, completedCount: 1 }),
  freshPath('c', 'Chess', null, NOW - 2 * HOUR, { colorSlot: 3, completedCount: 3 }),
  freshPath('d', 'Yoga', 's1', null, { colorSlot: 4 }),
]

const POOLS = [
  { pathId: 'a', skillId: 'a-s1', videos: [poolCard('pa1'), poolCard('pa2')] },
  { pathId: 'a', skillId: 'a-s3', videos: [poolCard('pa3')] },
  { pathId: 'b', skillId: 'b-s2', videos: [poolCard('pb1')] },
  { pathId: 'b', skillId: 'b-s3', videos: [poolCard('pb2')] },
]

/** New today in Guitar and Bouldering, one older Bouldering item, and one for finished Chess. */
const ITEMS: FreshItemCard[] = [
  freshItem('nb1', 'b', 's2', { publishedMs: NOW - HOUR, teachesThisSkill: 1, levelFit: 1 }),
  freshItem('na1', 'a', 's1', { publishedMs: NOW - 2 * HOUR }),
  freshItem('na2', 'a', 's3', { publishedMs: NOW - 30 * HOUR }),
  freshItem('nc1', 'c', 's1', { publishedMs: NOW - HOUR }),
]

function response(over: Partial<FreshResponseOk> = {}): FreshResponseOk {
  return freshResponse({ paths: PATHS, pools: POOLS, items: ITEMS, ...over })
}

function build(over: Partial<FreshViewInput> = {}): FreshView {
  return buildFreshView({ response: response(), chip: { kind: 'all' }, mutes: new Map(), events: [], demo: false, ...over })
}

const section = (view: FreshView, pathId: string) => {
  const found = view.sections.find((s) => s.pathId === pathId)
  if (!found) throw new Error(`no section ${pathId}`)
  return found
}
const ids = (view: FreshView, pathId: string): string[] => section(view, pathId).cards.map((c) => c.card.videoId)
const chipOf = (pathId: string): FilterChip => ({ kind: 'path', pathId })

describe('A. Opening the page', () => {
  it('A1: 2+ paths with new videos today', () => {
    const view = build()
    // "All hobbies" is selected.
    expect(view.chips.find((c) => c.selected)?.key).toBe('all')
    // The top-ranked video across all hobbies, "New today".
    expect(view.hero).toMatchObject({ kind: 'fresh', badge: 'today', skillTitle: 'Guitar s2', isCurrentSkill: true })
    expect(view.hero?.card.videoId).toBe('nb1')
    expect(view.hero?.path).toEqual({ pathId: 'b', hobby: 'Guitar', letter: 'G', colorSlot: 2 })
    // Sections: most recently active path first, paths never opened last.
    expect(view.sections.map((s) => s.hobby)).toEqual(['Guitar', 'Chess', 'Bouldering', 'Yoga'])
    // 2 new videos (nb1 as the hero, na1 as a card) across 2 hobbies; Chess's item is not shown.
    expect(view.newToday).toEqual({ videos: 2, hobbies: 2 })
    expect(newTodayText(view.newToday!)).toBe('2 new videos today across 2 hobbies')
    expect(freshPageState('ready', view, 4)).toMatchObject({ kind: 'content', hero: true, sections: true, chips: true, sources: true })
  })

  it('A2: one path gives "All hobbies" and "Saved" only, and "across 1 hobby"', () => {
    const view = build({ response: response({ paths: [PATHS[0]!] }) })
    expect(view.chips.map((c) => c.label)).toEqual(['All hobbies', 'Saved'])
    expect(view.sections.map((s) => s.hobby)).toEqual(['Bouldering'])
    expect(view.newToday).toEqual({ videos: 1, hobbies: 1 })
    expect(newTodayText(view.newToday!)).toBe('1 new video today across 1 hobby')
    // A Hobby_Chip request for the only path falls back to "All hobbies".
    expect(build({ response: response({ paths: [PATHS[0]!] }), chip: chipOf('a') }).chip).toEqual({ kind: 'all' })
  })

  it('A3: nothing new today hides the header text; the hero is "New this week" or "Best for your current skill"', () => {
    const week = build({ response: response({ items: [freshItem('w1', 'a', 's1', { publishedMs: NOW - 30 * HOUR })] }) })
    expect(week.newToday).toBeNull()
    expect(week.hero).toMatchObject({ kind: 'fresh', badge: 'week' })
    expect(week.quietLine).toBe(false)
    expect(week.chips.every((c) => c.newCount === 0)).toBe(true)

    const known = build({ response: response({ items: [] }) })
    expect(known.newToday).toBeNull()
    // The first path in Path_Order with a Current_Skill and a pool video: Guitar.
    expect(known.hero).toMatchObject({ kind: 'pool', badge: 'best', skillTitle: 'Guitar s2', isCurrentSkill: true })
    expect(known.hero?.card.videoId).toBe('pb1')
    expect(known.quietLine).toBe(true)
    expect(freshPageState('ready', known, 4)).toMatchObject({ kind: 'content', quietLine: true, hero: true })
  })

  it('A4: paths and no video at all: no hero, the empty state, each section header-only', () => {
    const view = build({ response: response({ items: [], pools: [] }) })
    expect(view.hero).toBeNull()
    expect(view.state).toBe('empty')
    expect(view.quietLine).toBe(false)
    expect(view.newToday).toBeNull()
    expect(view.sections.map((s) => [s.hobby, s.state, s.cards.length])).toEqual([
      ['Guitar', 'empty', 0],
      ['Chess', 'finished', 0],
      ['Bouldering', 'empty', 0],
      ['Yoga', 'empty', 0],
    ])
    // Wick's line shows, and the header-only sections, chips and sources stay (Req 10.3).
    expect(freshPageState('ready', view, 4)).toEqual({
      kind: 'empty',
      quietLine: false,
      chips: true,
      sources: true,
      hero: false,
      sections: true,
    })
  })
})

describe('B. Hobby sections', () => {
  it('B1: a hobby with Fresh_Items, some under 24 h', () => {
    // Bouldering is the only path with videos here, so its best item is the hero.
    const view = build({ response: response({ items: ITEMS.filter((i) => i.matches[0]!.pathId === 'a') }) })
    const s = section(view, 'a')
    expect(s).toMatchObject({
      hobby: 'Bouldering',
      letter: 'B',
      colorSlot: 1,
      currentSkillTitle: 'Bouldering s1',
      completedCount: 0,
      totalCount: 3,
      state: 'cards',
    })
    expect(view.hero?.card.videoId).toBe('na1')
    // The hero is new and belongs to this path: it counts in the badge and is not repeated.
    expect(s.newCount).toBe(1)
    // Fresh_Items first, then the best known videos of the Current_Window in window order.
    expect(s.cards.map((c) => [c.card.videoId, c.kind])).toEqual([
      ['na2', 'fresh'],
      ['pa1', 'pool'],
      ['pa2', 'pool'],
      ['pa3', 'pool'],
    ])
    expect(s.cards[0]).toMatchObject({ kind: 'fresh', isNew: false, tag: 'next', skillTitle: 'Bouldering s3' })
    expect(s.cards[0]!.kind === 'fresh' && s.cards[0]!.card.why).toBe('Why na2')

    // Under "All hobbies" with Guitar's hero, Bouldering's new item is a card with "New".
    const all = build()
    expect(section(all, 'a').cards[0]).toMatchObject({ kind: 'fresh', isNew: true, tag: 'current' })
    expect(section(all, 'a').newCount).toBe(1)
    expect(section(all, 'b')).toMatchObject({ newCount: 1, completedCount: 1, totalCount: 3, currentSkillTitle: 'Guitar s2' })
  })

  it('B2: Fresh_Items all older than 24 h: first in the row, no "New", no "n new" badge', () => {
    const old = [
      freshItem('o1', 'a', 's1', { publishedMs: NOW - 25 * HOUR }),
      freshItem('o2', 'a', 's1', { publishedMs: NOW - 60 * HOUR }),
    ]
    const view = build({ response: response({ items: old }) })
    const s = section(view, 'a')
    expect(view.hero?.card.videoId).toBe('o1')
    expect(s.cards.map((c) => c.card.videoId)).toEqual(['o2', 'pa1', 'pa3'])
    expect(s.cards[0]).toMatchObject({ kind: 'fresh', isNew: false })
    expect(s.newCount).toBe(0)
    expect(view.chips.find((c) => c.key === 'path:a')?.newCount).toBe(0)
  })

  it('B3: no Fresh_Items: best known videos with "<skill>" or "Next: <skill>" tags', () => {
    const view = build({ response: response({ items: [] }) })
    const s = section(view, 'a')
    expect(s.cards.map((c) => [c.card.videoId, c.kind, c.tag, c.skillTitle])).toEqual([
      ['pa1', 'pool', 'current', 'Bouldering s1'],
      ['pa2', 'pool', 'current', 'Bouldering s1'],
      ['pa3', 'pool', 'next', 'Bouldering s3'],
    ])
    expect(s.newCount).toBe(0)
  })

  it('a Fresh_Item on a Skill outside the Current_Window is tagged with the plain skill title', () => {
    const view = build({ response: response({ items: [freshItem('x1', 'b', 's1'), freshItem('x2', 'b', 's1', { teachesThisSkill: 0.5 })] }) })
    expect(view.hero).toMatchObject({ skillTitle: 'Guitar s1', isCurrentSkill: false })
    expect(section(view, 'b').cards[0]).toMatchObject({ kind: 'fresh', tag: 'other', skillTitle: 'Guitar s1' })
  })

  it('B4: a finished path is header-only with "Path finished", and its videos show nowhere', () => {
    const view = build()
    expect(section(view, 'c')).toMatchObject({
      state: 'finished',
      cards: [],
      newCount: 0,
      currentSkillTitle: null,
      completedCount: 3,
      totalCount: 3,
    })
    const shown = [view.hero?.card.videoId, ...view.sections.flatMap((s) => s.cards.map((c) => c.card.videoId))]
    expect(shown).not.toContain('nc1')
    expect(view.chips.find((c) => c.key === 'path:c')?.newCount).toBe(0)
    // Its Fresh_Item never becomes the Hero_Card, also alone on the page (Req 12.4).
    const alone = build({ response: response({ items: [ITEMS[3]!], pools: [] }) })
    expect(alone.hero).toBeNull()
    expect(build({ chip: chipOf('c') }).hero).toBeNull()
  })

  it('B5: a Current_Skill and no card left gives "No videos yet"', () => {
    const view = build()
    expect(section(view, 'd')).toMatchObject({ state: 'empty', cards: [], currentSkillTitle: 'Yoga s1' })
    // Also when the mutes, the hero and the cap leave nothing: Guitar with its only pool video as the hero.
    const guitar = build({
      response: response({ items: [], pools: [{ pathId: 'b', skillId: 'b-s2', videos: [poolCard('pb1')] }] }),
    })
    expect(guitar.hero?.card.videoId).toBe('pb1')
    expect(section(guitar, 'b').state).toBe('empty')
    const muted = build({ response: response({ items: [] }), mutes: new Map([['ch-pb1', true], ['ch-pb2', true]]) })
    expect(section(muted, 'b').state).toBe('empty')
    expect(muted.hero?.card.videoId).toBe('pa1')
  })

  it('B9: at most 3 cards of one Skill on the page, the hero included', () => {
    const many = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id, i) => freshItem(id, 'a', 's1', { publishedMs: NOW - (i + 1) * HOUR }))
    const view = build({ response: response({ paths: [PATHS[0]!], items: many }) })
    const ofSkill = [view.hero!, ...section(view, 'a').cards].filter((c) => c.match.skillId === 'a-s1')
    expect(ofSkill.map((c) => c.card.videoId)).toEqual(['m1', 'm2', 'm3'])
    // The pool of that Skill gets no slot; the next window Skill fills the row.
    expect(ids(view, 'a')).toEqual(['m2', 'm3', 'pa3'])
  })
})

describe('"new" counts (Req 12.3)', () => {
  it('does not count a New_Item left out by the Skill cap, in the section, the chip or the header', () => {
    // 5 new videos on Bouldering s1: the hero and 2 cards show, 2 are left out.
    const many = ['m1', 'm2', 'm3', 'm4', 'm5'].map((id, i) => freshItem(id, 'a', 's1', { publishedMs: NOW - (i + 1) * HOUR }))
    const res = response({ items: many })
    const all = build({ response: res })
    expect(section(all, 'a').newCount).toBe(3)
    expect(all.chips.find((c) => c.key === 'path:a')?.newCount).toBe(3)
    expect(all.newToday).toEqual({ videos: 3, hobbies: 1 })
    // The same under the hobby's chip.
    const narrowed = build({ response: res, chip: chipOf('a') })
    expect(section(narrowed, 'a').newCount).toBe(3)
    expect(narrowed.newToday).toEqual({ videos: 3, hobbies: 1 })
    expect(newTodayText(narrowed.newToday!)).toBe('3 new videos today across 1 hobby')
  })

  it('counts 86399 s as new and 86400 s as not new', () => {
    const edge = (ageSeconds: number) =>
      build({ response: response({ paths: [PATHS[0]!], items: [freshItem('e1', 'a', 's1', { publishedMs: NOW - ageSeconds * SECOND })] }) })
    expect(edge(86399).newToday).toEqual({ videos: 1, hobbies: 1 })
    expect(section(edge(86399), 'a').newCount).toBe(1)
    expect(edge(86400).newToday).toBeNull()
    expect(section(edge(86400), 'a').newCount).toBe(0)
  })

  it('does not count a muted channel, and counts it again when unmuted', () => {
    const muted = build({ mutes: new Map([['ch-na1', true]]) })
    expect(section(muted, 'a').newCount).toBe(0)
    expect(muted.chips.find((c) => c.key === 'path:a')?.newCount).toBe(0)
    expect(muted.newToday).toEqual({ videos: 1, hobbies: 1 })
    expect(newTodayText(muted.newToday!)).toBe('1 new video today across 1 hobby')
    expect(build({ mutes: new Map([['ch-na1', false]]) }).newToday).toEqual({ videos: 2, hobbies: 2 })
  })

  it('counts the Hero_Card video once: in the header total and in its path badge', () => {
    const view = build()
    expect(view.hero?.card.videoId).toBe('nb1')
    expect(ids(view, 'b')).not.toContain('nb1')
    expect(section(view, 'b').newCount).toBe(1)
    expect(view.chips.find((c) => c.key === 'path:b')?.newCount).toBe(1)
    expect(view.newToday?.videos).toBe(2)
  })

  it('uses the singular and plural forms', () => {
    expect(newTodayText({ videos: 1, hobbies: 1 })).toBe('1 new video today across 1 hobby')
    expect(newTodayText({ videos: 2, hobbies: 1 })).toBe('2 new videos today across 1 hobby')
    expect(newTodayText({ videos: 4, hobbies: 4 })).toBe('4 new videos today across 4 hobbies')
  })
})

describe('hero badges (Req 12.4)', () => {
  const heroAt = (ageSeconds: number) =>
    build({ response: response({ items: [freshItem('h1', 'a', 's1', { publishedMs: NOW - ageSeconds * SECOND })] }) }).hero

  it('is "New today" at 86399 s, "New this week" from 86400 s to 604799 s, and a known video after that', () => {
    expect(heroAt(0)).toMatchObject({ kind: 'fresh', badge: 'today' })
    expect(heroAt(86399)).toMatchObject({ kind: 'fresh', badge: 'today' })
    expect(heroAt(86400)).toMatchObject({ kind: 'fresh', badge: 'week' })
    expect(heroAt(604799)).toMatchObject({ kind: 'fresh', badge: 'week' })
    // At 7 days the item is no longer shown: the fallback takes over.
    expect(heroAt(604800)).toMatchObject({ kind: 'pool', badge: 'best' })
    expect(heroAt(604800)?.card.videoId).toBe('pb1')
  })
})

describe('C. Chips', () => {
  it('C1: "All hobbies", one chip per hobby in section order with its dot and new count, then "Saved"', () => {
    const view = build()
    expect(view.chips.map((c) => [c.label, c.colorSlot, c.newCount, c.selected])).toEqual([
      ['All hobbies', null, 0, true],
      ['Guitar', 2, 1, false],
      ['Chess', 3, 0, false],
      ['Bouldering', 1, 1, false],
      ['Yoga', 4, 0, false],
      ['Saved', null, 0, false],
    ])
    expect(view.chips.map((c) => c.key)).toEqual(['all', 'path:b', 'path:c', 'path:a', 'path:d', 'saved'])
  })

  it('C2: a hobby chip narrows the hero, the header text and the sections to that hobby', () => {
    const all = build()
    const view = build({ chip: chipOf('a') })
    expect(view.chip).toEqual(chipOf('a'))
    expect(view.chips.filter((c) => c.selected).map((c) => c.key)).toEqual(['path:a'])
    expect(view.sections.map((s) => s.pathId)).toEqual(['a'])
    // The hobby's own top video becomes the hero and leaves its row.
    expect(view.hero?.card.videoId).toBe('na1')
    expect(view.hero?.path.pathId).toBe('a')
    expect(ids(view, 'a')).toEqual(['na2', 'pa1', 'pa2', 'pa3'])
    // The same videos as under "All hobbies", where na1 is the first card of the row.
    expect(ids(all, 'a')).toEqual(['na1', 'na2', 'pa1', 'pa2', 'pa3'])
    expect(view.newToday).toEqual({ videos: 1, hobbies: 1 })
    // The badges are the same under both chips.
    expect(section(view, 'a').newCount).toBe(section(all, 'a').newCount)
    expect(view.chips.map((c) => c.newCount)).toEqual(all.chips.map((c) => c.newCount))
    // The Sources_Panel keeps every hobby.
    expect(view.sources.map((g) => g.hobby)).toEqual(['Guitar', 'Chess', 'Bouldering', 'Yoga'])
  })

  it('C3: back on "All hobbies" every section shows again, with the mutes made in between', () => {
    const mutes = new Map<string, boolean>()
    expect(build({ chip: chipOf('a'), mutes }).sections).toHaveLength(1)
    mutes.set('ch-pa1', true)
    const back = build({ chip: { kind: 'all' }, mutes })
    expect(back.sections.map((s) => s.pathId)).toEqual(['b', 'c', 'a', 'd'])
    expect(ids(back, 'a')).not.toContain('pa1')
    expect(ids(back, 'a')).toEqual(['na1', 'na2', 'pa2', 'pa3'])
  })

  it('C4: "Saved" shows the saved list with no hero and no section; empty gives the saved-empty state', () => {
    const snap = { videoId: 'sv1', title: 'Saved one', channel: 'c', channelId: 'ch-sv1', thumbnailUrl: 'https://i.ytimg.com/x.jpg', durationSeconds: 60 }
    const events = [applySave(newEvent('sv1', 'feed', 1), true, 100, snap)]
    const view = build({ chip: { kind: 'saved' }, events })
    expect(view.saved.map((s) => s.videoId)).toEqual(['sv1'])
    expect(view.hero).toBeNull()
    expect(view.sections).toEqual([])
    expect(view.newToday).toBeNull()
    expect(freshPageState('ready', view, 4)).toMatchObject({ kind: 'saved', hero: false, sections: false, chips: true })

    const empty = build({ chip: { kind: 'saved' } })
    expect(empty.state).toBe('saved_empty')
    expect(freshPageState('ready', empty, 4).kind).toBe('saved_empty')
  })

  it('C5: there is no "For <current skill>" chip, and an old request for it selects "All hobbies"', () => {
    const view = build({ chip: { kind: 'current' } as unknown as FilterChip })
    expect(view.chips.some((c) => c.label.startsWith('For '))).toBe(false)
    expect(view.chips.map((c) => c.chip.kind)).toEqual(['all', 'path', 'path', 'path', 'path', 'saved'])
    expect(view.chip).toEqual({ kind: 'all' })
  })

  it('C6: Demo_Mode has no "Saved" chip, and a request for it selects "All hobbies"', () => {
    const view = build({ chip: { kind: 'saved' }, demo: true })
    expect(view.chips.map((c) => c.label)).toEqual(['All hobbies', 'Guitar', 'Chess', 'Bouldering', 'Yoga'])
    expect(view.chip).toEqual({ kind: 'all' })
    expect(view.saved).toEqual([])
  })

  it('a chip for a path that left the response selects "All hobbies" (Req 2.9)', () => {
    const view = build({ chip: chipOf('gone') })
    expect(view.chip).toEqual({ kind: 'all' })
    expect(view.sections).toHaveLength(4)
  })
})
