// Fresh_Page behavior with the composables and the pure view (spec: fresh-v2, task 6.1, Req 1.4,
// 4.7, 8.3 to 8.5, 10, 11, 12.2, 12.10; spec: fresh, Req 19.13, 19.14, 19.20, 19.21).
// No DOM mounting: @vue/test-utils is not installed.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { FreshResponseOk, SaveSnapshot } from '../../shared/types/fresh'
import type { VideoEvent, VideoSource } from '../../shared/types/video'
import { buildFreshView, type FilterChip, type FreshViewInput } from '../../shared/utils/fresh-view'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { streakDays } from '../../shared/utils/streak'
import { applyPlay, applyProgress, applySave, applySkip, newEvent } from '../../shared/utils/video-events'
import { levelFor, xpFor } from '../../shared/utils/xp'
import sample from '../../data/sample-bouldering.json'
import { createMuteController } from '../../app/composables/useChannelMutes'
import { mergeEventLists } from '../../app/composables/useVideoEvents'
import { createFreshLoader } from '../../app/composables/useFresh'
import { ACTIVITY_STORAGE_KEY } from '../../app/utils/activity-store'
import { CHANNEL_MUTES_KEY } from '../../app/utils/channel-mutes-store'
import { createFreshActions, type FreshRecorder, type FreshShownVideo } from '../../app/utils/fresh-actions'
import {
  channelCountText,
  freshPageState,
  newTodayText,
  nextOpenGroups,
  pathLink,
  skillLink,
  toggleGroup,
  updatedLabel,
} from '../../app/utils/fresh-page'
import { progressStorageKey, serializeProgress } from '../../app/utils/progress-store'
import { eventKey, readLocalEvents, VIDEO_EVENTS_KEY, writeLocalEvents } from '../../app/utils/video-events-store'
import { HOUR, NOW, freshItem, freshPath, freshResponse, memoryStorage, poolCard, type MemoryStorage } from '../support/fresh-client'

const loadedTree = loadSkillTree(sample)
if (!loadedTree.ok) throw new Error('sample tree must load')
const tree = loadedTree.value

function twoPaths(over: Partial<FreshResponseOk> = {}): FreshResponseOk {
  return freshResponse({
    paths: [freshPath('a', 'Bouldering', 's1', NOW - 5 * HOUR), freshPath('b', 'Guitar', 's2', NOW - HOUR)],
    pools: [
      { pathId: 'a', skillId: 'a-s1', videos: [poolCard('pa1'), poolCard('pa2')] },
      { pathId: 'b', skillId: 'b-s2', videos: [poolCard('pb1')] },
    ],
    ...over,
  })
}

function input(over: Partial<FreshViewInput> = {}): FreshViewInput {
  return { response: twoPaths(), chip: { kind: 'all' }, mutes: new Map(), events: [], demo: false, ...over }
}

/** A recorder over the real reducers and the real local event store. */
function storedRecorder(storage: MemoryStorage): FreshRecorder & { calls: { kind: string; source: VideoSource }[]; events(): VideoEvent[] } {
  const calls: { kind: string; source: VideoSource }[] = []
  function update(videoId: string, source: VideoSource, change: (rec: VideoEvent, now: number) => VideoEvent): void {
    const map = readLocalEvents(storage)
    const key = eventKey({ videoId, source })
    const now = NOW + calls.length
    map.set(key, change(map.get(key) ?? newEvent(videoId, source, now), now))
    writeLocalEvents(storage, map)
  }
  return {
    calls,
    events: () => [...readLocalEvents(storage).values()],
    recordPlay(videoId, source) {
      calls.push({ kind: 'play', source })
      update(videoId, source, (r, n) => applyPlay(r, n))
    },
    recordProgress(videoId, seconds, duration, source) {
      calls.push({ kind: 'progress', source })
      update(videoId, source, (r, n) => applyProgress(r, seconds, duration, n))
    },
    recordSave(videoId, saved, source, snapshot) {
      calls.push({ kind: 'save', source })
      update(videoId, source, (r, n) => applySave(r, saved, n, snapshot))
    },
    recordSkip(videoId, source) {
      calls.push({ kind: 'skip', source })
      update(videoId, source, (r, n) => applySkip(r, n))
    },
  }
}

const VIDEO: FreshShownVideo = {
  videoId: 'abcdefghijk',
  title: 'The silent feet drill',
  channel: 'Climb Coach',
  channelId: 'UCcoach',
  thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg',
  durationSeconds: 100,
}

describe('page states (Req 19.13)', () => {
  it('loading and error show only their state', () => {
    const view = buildFreshView(input())
    for (const status of ['loading', 'error'] as const) {
      const page = freshPageState(status, view, 2)
      expect(page.kind).toBe(status)
      expect([page.chips, page.sources, page.hero, page.sections, page.quietLine]).toEqual([
        false, false, false, false, false,
      ])
    }
  })

  it('no paths: Wick and "Build your first path", no chips, sections or sources (Req 16.1)', () => {
    const view = buildFreshView(input({ response: freshResponse() }))
    const page = freshPageState('ready', view, 0)
    expect(page.kind).toBe('no_paths')
    expect(page.chips || page.sources || page.hero || page.sections).toBe(false)
    const state = readFileSync(new URL('../../app/components/fresh/FreshState.vue', import.meta.url), 'utf8')
    expect(state).toContain('Build your first path')
    expect(state).toContain('to="/new"')
  })

  it('pool videos only: the quiet line below the chips (Req 10.2)', () => {
    const view = buildFreshView(input())
    const page = freshPageState('ready', view, 2)
    expect(page).toEqual({ kind: 'content', quietLine: true, hero: true, sections: true, chips: true, sources: true })
    const state = readFileSync(new URL('../../app/components/fresh/FreshState.vue', import.meta.url), 'utf8')
    expect(state).toContain('No new videos today. Here are the best ones for your skills.')
  })

  it('a Fresh_Item on the page: no quiet line', () => {
    const view = buildFreshView(input({ response: twoPaths({ items: [freshItem('n1', 'a', 's1')] }) }))
    expect(freshPageState('ready', view, 2)).toMatchObject({ kind: 'content', quietLine: false, hero: true, sections: true })
  })

  it('nothing at all: the empty Wick line, with the header-only sections, chips and sources kept (Req 10.3)', () => {
    const view = buildFreshView(input({ response: twoPaths({ pools: [] }) }))
    const page = freshPageState('ready', view, 2)
    expect(page).toEqual({ kind: 'empty', chips: true, sources: true, hero: false, quietLine: false, sections: true })
    expect(view.sections.map((s) => s.state)).toEqual(['empty', 'empty'])
    const state = readFileSync(new URL('../../app/components/fresh/FreshState.vue', import.meta.url), 'utf8')
    expect(state).toContain('No videos yet. Pursio checks for new ones every day.')
  })

  it('no successful check time: no "Updated" text (Req 11.6)', () => {
    const view = buildFreshView(input())
    expect(view.updatedMs).toBeNull()
    expect(updatedLabel(view.updatedMs, NOW)).toBeNull()
    expect(updatedLabel(NOW - 2 * HOUR, NOW)).toBe('2h ago')
  })

  it('a failed request shows "Couldn\'t load Fresh right now." and "Try again" (Req 16.4)', async () => {
    const loader = createFreshLoader({ load: async () => Promise.reject(new Error('down')) })
    await loader.start()
    expect(freshPageState(loader.status.value, null, 0).kind).toBe('error')
    const state = readFileSync(new URL('../../app/components/fresh/FreshState.vue', import.meta.url), 'utf8')
    expect(state).toContain("Couldn't load Fresh right now.")
    expect(state).toContain('Try again')
    expect(state).toContain(':disabled="pending"')
  })
})

describe('events (Req 19.14)', () => {
  it('play, finish and save record Source feed; a save stores the snapshot; XP, level and streak stay', () => {
    const storage = memoryStorage()
    const progress = { completed: [tree.sections[0]!.nodes[0]!.id], quests: {} }
    const progressKey = progressStorageKey(tree.hobby)
    storage.setItem(progressKey, serializeProgress(progress))
    storage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify({ completions: [NOW - HOUR] }))
    const before = { xp: xpFor(tree, progress), level: levelFor(xpFor(tree, progress)), streak: streakDays([NOW - HOUR], NOW) }
    const progressRaw = storage.getItem(progressKey)
    const activityRaw = storage.getItem(ACTIVITY_STORAGE_KEY)

    const recorder = storedRecorder(storage)
    const actions = createFreshActions({ demo: false, recorder, events: () => recorder.events(), shown: () => true })
    actions.play(VIDEO.videoId)
    actions.onPlaying(VIDEO)
    actions.onProgress(VIDEO, 85) // 85 of 100 s: Finished
    actions.toggleSave(VIDEO)

    expect(recorder.calls.map((c) => c.source)).toEqual(['feed', 'feed', 'feed'])
    const rec = readLocalEvents(storage).get(eventKey({ videoId: VIDEO.videoId, source: 'feed' }))!
    expect(rec.playedAt).not.toBeNull()
    expect(rec.finished).toBe(true)
    expect(rec.saved).toBe(true)
    const expected: SaveSnapshot = { ...VIDEO }
    expect(rec.snapshot).toEqual(expected)
    expect(rec.snapshotAt).toBe(rec.savedAt)
    expect(actions.isSaved(VIDEO.videoId)).toBe(true)

    // A removal keeps the snapshot (Req 17.4).
    actions.toggleSave(VIDEO)
    const removed = readLocalEvents(storage).get(eventKey({ videoId: VIDEO.videoId, source: 'feed' }))!
    expect(removed.saved).toBe(false)
    expect(removed.snapshot).toEqual(expected)

    expect(storage.getItem(progressKey)).toBe(progressRaw)
    expect(storage.getItem(ACTIVITY_STORAGE_KEY)).toBe(activityRaw)
    const after = { xp: xpFor(tree, progress), level: levelFor(xpFor(tree, progress)), streak: streakDays([NOW - HOUR], NOW) }
    expect(after).toEqual(before)
  })

  it('records a skip only for a shown card that was never played (Req 17.5)', () => {
    const storage = memoryStorage()
    const recorder = storedRecorder(storage)
    let shown = false
    const actions = createFreshActions({ demo: false, recorder, events: () => recorder.events(), shown: () => shown })
    actions.onSkipped('v1')
    expect(recorder.calls).toEqual([])
    shown = true
    actions.onSkipped('v1')
    expect(recorder.calls).toEqual([{ kind: 'skip', source: 'feed' }])
    recorder.recordPlay('v2', 'skill_sheet')
    actions.onSkipped('v2')
    expect(recorder.calls.filter((c) => c.kind === 'skip')).toHaveLength(1)
  })
})

describe('chips, mutes and playback (Req 19.19)', () => {
  it('opens on "All hobbies"; chips and a mute change send no new request (Req 12.2)', async () => {
    let requests = 0
    const response = twoPaths({
      items: [freshItem('n1', 'a', 's1'), freshItem('n2', 'b', 's2', { channelId: 'UCmute' })],
      sources: [{ hobby: 'Guitar', language: 'en', channelId: 'UCmute', channelName: 'Mute me' }],
    })
    const loader = createFreshLoader({
      load: async () => {
        requests += 1
        return response
      },
    })
    await loader.start()
    expect(requests).toBe(1)

    const storage = memoryStorage()
    const mutes = createMuteController({ storage: () => storage, now: () => NOW, sender: () => null })
    const view = (chip: FilterChip) =>
      buildFreshView({ response: loader.response.value!, chip, mutes: mutes.muted.value, events: [], demo: false })

    const opening = view({ kind: 'all' })
    expect(opening.chips.find((c) => c.selected)?.label).toBe('All hobbies')
    for (const chip of opening.chips) view(chip.chip)
    const ids = (v: ReturnType<typeof view>) => [
      v.hero?.card.videoId,
      ...v.sections.flatMap((s) => s.cards.map((c) => c.card.videoId)),
    ]
    expect(ids(view({ kind: 'all' }))).toContain('n2')
    expect(view({ kind: 'all' }).newToday).toEqual({ videos: 2, hobbies: 2 })
    mutes.setMuted('UCmute', true)
    // The mute also updates the "new" counts, with no request (Req 8.6).
    expect(ids(view({ kind: 'all' }))).not.toContain('n2')
    expect(view({ kind: 'all' }).newToday).toEqual({ videos: 1, hobbies: 1 })
    expect(view({ kind: 'all' }).chips.find((c) => c.key === 'path:b')?.newCount).toBe(0)
    mutes.setMuted('UCmute', false)
    expect(ids(view({ kind: 'all' }))).toContain('n2')
    expect(requests).toBe(1)
  })

  it('shows the new-today text only with content, and never a "For <current skill>" chip', () => {
    const v = buildFreshView(input({ response: twoPaths({ items: [freshItem('n1', 'a', 's1')] }) }))
    expect(v.chips.map((c) => c.label)).toEqual(['All hobbies', 'Guitar', 'Bouldering', 'Saved'])
    expect(v.newToday && newTodayText(v.newToday)).toBe('1 new video today across 1 hobby')
    const header = readFileSync(new URL('../../app/components/fresh/FreshHeader.vue', import.meta.url), 'utf8')
    // Right-aligned from lg, hidden below it and when there is nothing new (Req 1.4, 1.5).
    expect(header).toMatch(/<p v-if="newToday" class="hidden[^"]*text-right[^"]*lg:block"/)
    expect(header).toContain('Updated {{ updated }}')
  })

  it('"Saved" orders by Saved_Time desc and shows no Hero_Card (Req 14.6, 12.7)', () => {
    const snap = (id: string): SaveSnapshot => ({ ...VIDEO, videoId: id, title: `T ${id}`, channelId: `ch-${id}` })
    const events = [
      applySave(newEvent('x1', 'feed', 1), true, 100, snap('x1')),
      applySave(newEvent('x2', 'feed', 1), true, 300, snap('x2')),
      applySave(newEvent('x3', 'feed', 1), true, 200, snap('x3')),
    ]
    const v = buildFreshView(input({ chip: { kind: 'saved' }, events }))
    expect(v.hero).toBeNull()
    expect(v.saved.map((s) => s.videoId)).toEqual(['x2', 'x3', 'x1'])
    expect(freshPageState('ready', v, 2)).toMatchObject({ kind: 'saved', hero: false, sections: false })
  })

  it('starting one video stops the other: one active video at a time (Req 13.7)', () => {
    const actions = createFreshActions({ demo: false, recorder: null, events: () => [], shown: () => true })
    actions.play('v1')
    actions.play('v2')
    expect(actions.activeVideoId.value).toBe('v2')
    actions.stop()
    expect(actions.activeVideoId.value).toBeNull()
  })

  it('a chip or mute that hides the playing card stops it (Req 17.2)', () => {
    let visible = new Set(['v1'])
    const actions = createFreshActions({ demo: false, recorder: null, events: () => [], shown: (id) => visible.has(id) })
    actions.play('v1')
    actions.syncShown()
    expect(actions.activeVideoId.value).toBe('v1')
    visible = new Set()
    actions.syncShown()
    expect(actions.activeVideoId.value).toBeNull()
  })

  it('skill tags open the matched Skill_Sheet, demo links keep the demo (Req 7.4)', () => {
    const paths = [{ id: 'uuid-1', hobbyId: 'bouldering' }]
    expect(skillLink(paths, 'uuid-1', 'edge s1', false)).toBe('/path?hobby=bouldering&skill=edge%20s1')
    expect(skillLink(paths, 'uuid-1', 'x', true)).toBe('/path?demo=1&skill=x')
    expect(skillLink(paths, 'missing', 'x', false)).toBeNull()
  })

  it('"Open path" opens that hobby on the Path page, or the demo path in Demo_Mode (Req 4.7, 11.2)', () => {
    const paths = [
      { id: 'uuid-1', hobbyId: 'film photography' },
      { id: 'guitar', hobbyId: null },
    ]
    // A cloud path links by its Hobby_Id, a local one by its id; `/path?hobby=` sets the active hobby.
    expect(pathLink(paths, 'uuid-1', false)).toBe('/path?hobby=film%20photography')
    expect(pathLink(paths, 'guitar', false)).toBe('/path?hobby=guitar')
    expect(pathLink(paths, 'missing', false)).toBeNull()
    expect(pathLink(paths, 'uuid-1', true)).toBe('/path?demo=1')
    expect(pathLink([], 'demo', true)).toBe('/path?demo=1')
  })
})

describe('Sources_Panel accordion (Req 12.10)', () => {
  const sources = [
    { hobby: 'Guitar', language: 'en', channelId: 'UCg1', channelName: 'Strings' },
    { hobby: 'Guitar', language: 'en', channelId: 'UCg2', channelName: 'Frets' },
    { hobby: 'Bouldering', language: 'en', channelId: 'UCb1', channelName: 'Climb Coach' },
  ]
  // Path_Order: Guitar, Bouldering, then Yoga, which has no channel.
  const three = (): FreshResponseOk =>
    twoPaths({
      paths: [
        freshPath('a', 'Bouldering', 's1', NOW - 5 * HOUR),
        freshPath('b', 'Guitar', 's2', NOW - HOUR),
        freshPath('y', 'Yoga', 's1'),
      ],
      sources,
    })
  const viewOf = (chip: FilterChip) => buildFreshView(input({ response: three(), chip }))

  it('writes the channel count as "none yet", "1 channel" and "<n> channels"', () => {
    expect(channelCountText(0)).toBe('none yet')
    expect(channelCountText(1)).toBe('1 channel')
    expect(channelCountText(2)).toBe('2 channels')
    expect(viewOf({ kind: 'all' }).sources.map((g) => [g.hobby, channelCountText(g.entries.length)])).toEqual([
      ['Guitar', '2 channels'],
      ['Bouldering', '1 channel'],
      ['Yoga', 'none yet'],
    ])
  })

  it('opens the first group under "All hobbies" and "Saved", and the selected hobby\'s group under its chip', () => {
    expect(viewOf({ kind: 'all' }).defaultOpenSource).toBe('b')
    expect(viewOf({ kind: 'saved' }).defaultOpenSource).toBe('b')
    expect(viewOf({ kind: 'path', pathId: 'a' }).defaultOpenSource).toBe('a')
    expect([...nextOpenGroups(new Set(), viewOf({ kind: 'all' }).defaultOpenSource)]).toEqual(['b'])
  })

  it('keeps several groups open together and the user\'s choices across chip changes', () => {
    const groups = viewOf({ kind: 'all' }).sources
    let open = nextOpenGroups(new Set<string>(), viewOf({ kind: 'all' }).defaultOpenSource)
    // The user opens Bouldering too: both stay open.
    open = toggleGroup(open, 'a', groups)
    expect([...open].sort()).toEqual(['a', 'b'])
    // The user closes Guitar; selecting the Bouldering chip keeps that.
    open = toggleGroup(open, 'b', groups)
    open = nextOpenGroups(open, viewOf({ kind: 'path', pathId: 'a' }).defaultOpenSource)
    expect([...open]).toEqual(['a'])
    // Selecting the Guitar chip opens its group again and keeps Bouldering open.
    open = nextOpenGroups(open, viewOf({ kind: 'path', pathId: 'b' }).defaultOpenSource)
    expect([...open].sort()).toEqual(['a', 'b'])
  })

  it('never opens a group with no Channel_Source', () => {
    const groups = viewOf({ kind: 'all' }).sources
    expect([...toggleGroup(new Set(), 'y', groups)]).toEqual([])
    // Its chip opens nothing, and closes nothing.
    expect(viewOf({ kind: 'path', pathId: 'y' }).defaultOpenSource).toBeNull()
    expect([...nextOpenGroups(new Set(['b']), viewOf({ kind: 'path', pathId: 'y' }).defaultOpenSource)]).toEqual(['b'])
    const group = readFileSync(new URL('../../app/components/fresh/FreshSourcesGroup.vue', import.meta.url), 'utf8')
    // The header is a button with its expanded state only when there are channels (Req 8.4, 8.5).
    expect(group).toMatch(/<button\s+v-if="expandable"[^>]*:aria-expanded="expanded"[^>]*:aria-controls="listId"/)
    expect(group).toContain('<span v-else')
  })

  it('shows the heading, the subtitle and the closing line (Req 8.1, 8.7)', () => {
    const panel = readFileSync(new URL('../../app/components/fresh/FreshSourcesPanel.vue', import.meta.url), 'utf8')
    expect(panel).toContain('Your sources')
    expect(panel).toContain('The channels Pursio checks every day, grouped by hobby.')
    expect(panel).toContain('Videos play from YouTube; nothing is copied.')
  })
})

describe('Demo_Mode (Req 19.20)', () => {
  it('writes 0 mutes, events and snapshots after play, finish, save and skip', () => {
    const storage = memoryStorage()
    const recorder = storedRecorder(storage)
    const actions = createFreshActions({ demo: true, recorder, events: () => [], shown: () => true })
    actions.play(VIDEO.videoId)
    actions.onPlaying(VIDEO)
    actions.onProgress(VIDEO, 100)
    actions.toggleSave(VIDEO)
    actions.onSkipped('other')
    expect(recorder.calls).toEqual([])
    expect(storage.writes).toBe(0)
    expect(storage.data.has(VIDEO_EVENTS_KEY)).toBe(false)
    expect(storage.data.has(CHANNEL_MUTES_KEY)).toBe(false)
  })

  it('shows no "Saved" chip, and the page mounts no recorder, mute store, switch or save control', () => {
    const v = buildFreshView(input({ demo: true }))
    expect(v.chips.some((c) => c.chip.kind === 'saved')).toBe(false)
    const page = readFileSync(new URL('../../app/pages/fresh.vue', import.meta.url), 'utf8')
    expect(page).toContain('const recorder = isDemo ? null : useVideoEvents()')
    expect(page).toContain('const mutes = isDemo ? null : useChannelMutes()')
    // The saved grid, the Hero_Card and every Hobby_Section get the flag.
    expect(page.match(/:show-save="!isDemo"/g)?.length).toBe(3)
    const section = readFileSync(new URL('../../app/components/fresh/FreshHobbySection.vue', import.meta.url), 'utf8')
    expect(section).toContain(':show-save="showSave"')
    const card = readFileSync(new URL('../../app/components/fresh/FreshVideoCard.vue', import.meta.url), 'utf8')
    expect(card).toMatch(/<FreshSaveButton v-if="showSave"/)
    const hero = readFileSync(new URL('../../app/components/fresh/FreshHeroCard.vue', import.meta.url), 'utf8')
    expect(hero).toMatch(/<FreshSaveButton v-if="showSave"/)
    // Groups still open and close in Demo_Mode, with channel names only (Req 11.1).
    const group = readFileSync(new URL('../../app/components/fresh/FreshSourcesGroup.vue', import.meta.url), 'utf8')
    expect(group).toMatch(/<FreshMuteSwitch\s+v-if="!demo"/)
    // Path links keep the demo (Req 11.2).
    expect(page).toContain('pathLink(response.value?.paths ?? [], pathId, isDemo)')
  })

  it('builds the request from the Sample_Tree with no token', () => {
    const page = readFileSync(new URL('../../app/pages/fresh.vue', import.meta.url), 'utf8')
    expect(page).toContain("kind: 'demo'")
    expect(page).not.toMatch(/\/api\/fresh\/check|googleapis|youtube\.com\/feeds/)
  })
})

describe('"Saved" from the snapshot (Req 19.21)', () => {
  it('shows a saved video after its Fresh_Item is gone and with no pool', () => {
    const snapshot: SaveSnapshot = { ...VIDEO }
    const saved = applySave(newEvent(VIDEO.videoId, 'feed', 1), true, NOW - HOUR, snapshot)
    const cloudRow = { ...saved }
    // A later local save without a snapshot (Source feed) merges with the cloud row and keeps it.
    const merged = mergeEventLists([cloudRow], [applySave(saved, true, NOW - HOUR + 1)])
    const v = buildFreshView(input({ response: twoPaths({ items: [], pools: [] }), chip: { kind: 'saved' }, events: merged }))
    expect(v.saved).toHaveLength(1)
    expect(v.saved[0]!.snapshot).toEqual(snapshot)
    expect(v.saved[0]!.thumbnailAllowed).toBe(true)
  })

  it('merging keeps the newer snapshot, a present one over a missing one, and is order-free', () => {
    const a = applySave(newEvent('v', 'feed', 1), true, 100, { ...VIDEO, videoId: 'v', title: 'old' })
    const b = applySave(newEvent('v', 'feed', 1), true, 200, { ...VIDEO, videoId: 'v', title: 'new' })
    const removal = applySave(newEvent('v', 'feed', 1), false, 300)
    expect(mergeEventLists([a], [b])[0]!.snapshot?.title).toBe('new')
    expect(mergeEventLists([b], [a])).toEqual(mergeEventLists([a], [b]))
    const withRemoval = mergeEventLists([b], [removal])[0]!
    expect(withRemoval.saved).toBe(false)
    expect(withRemoval.snapshot?.title).toBe('new')
  })
})
