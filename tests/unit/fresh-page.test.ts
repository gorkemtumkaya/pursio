// Fresh_Page behavior with the composables and the pure view (spec: fresh, task 16.7;
// Req 11.8, 19.13, 19.14, 19.19, 19.20, 19.21). No DOM mounting: @vue/test-utils is not installed.
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
import { freshPageState, skillLink, updatedLabel } from '../../app/utils/fresh-page'
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
  return { response: twoPaths(), chip: { kind: 'all' }, selectedPathId: null, mutes: new Map(), events: [], demo: false, ...over }
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
      expect([page.chips, page.sources, page.hero, page.newSection, page.bestSection, page.quietLine]).toEqual([
        false, false, false, false, false, false,
      ])
    }
  })

  it('no paths: Wick and "Build your first path", no chips, sections or sources (Req 16.1)', () => {
    const view = buildFreshView(input({ response: freshResponse() }))
    const page = freshPageState('ready', view, 0)
    expect(page.kind).toBe('no_paths')
    expect(page.chips || page.sources || page.hero || page.newSection || page.bestSection).toBe(false)
    const state = readFileSync(new URL('../../app/components/fresh/FreshState.vue', import.meta.url), 'utf8')
    expect(state).toContain('Build your first path')
    expect(state).toContain('to="/new"')
  })

  it('pool videos only: the quiet line below the chips (Req 16.2)', () => {
    const view = buildFreshView(input())
    const page = freshPageState('ready', view, 2)
    expect(page).toMatchObject({ kind: 'content', quietLine: true, newSection: false, chips: true, sources: true })
  })

  it('nothing at all: the empty Wick line, chips and sources kept (Req 16.3)', () => {
    const view = buildFreshView(input({ response: twoPaths({ pools: [] }) }))
    const page = freshPageState('ready', view, 2)
    expect(page).toMatchObject({ kind: 'empty', chips: true, sources: true, hero: false, quietLine: false })
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
  it('opens on "All skills"; chips and a mute change send no new request', async () => {
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
      buildFreshView({ response: loader.response.value!, chip, selectedPathId: null, mutes: mutes.muted.value, events: [], demo: false })

    const opening = view({ kind: 'all' })
    expect(opening.chips.find((c) => c.selected)?.label).toBe('All skills')
    for (const chip of opening.chips) view(chip.chip)
    const ids = (v: ReturnType<typeof view>) => [v.hero?.card.videoId, ...v.newCards.map((c) => c.card.videoId)]
    expect(ids(view({ kind: 'all' }))).toContain('n2')
    mutes.setMuted('UCmute', true)
    expect(ids(view({ kind: 'all' }))).not.toContain('n2')
    mutes.setMuted('UCmute', false)
    expect(ids(view({ kind: 'all' }))).toContain('n2')
    expect(requests).toBe(1)
  })

  it('hides "For <current skill>" when the Selected_Path has no Current_Skill (Req 14.10)', () => {
    const response = freshResponse({ paths: [freshPath('a', 'Bouldering', null)] })
    const v = buildFreshView(input({ response }))
    expect(v.chips.map((c) => c.chip.kind)).toEqual(['all', 'path', 'saved'])
    const withCurrent = buildFreshView(input())
    expect(withCurrent.chips[0]?.label).toBe('All skills')
    expect(withCurrent.chips[1]?.label).toBe('For Bouldering s1')
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
    expect(freshPageState('ready', v, 2)).toMatchObject({ kind: 'saved', hero: false, newSection: false })
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

  it('skill tags open the matched Skill_Sheet, demo links keep the demo (Req 13.4)', () => {
    const paths = [{ id: 'uuid-1', hobbyId: 'bouldering' }]
    expect(skillLink(paths, 'uuid-1', 'edge s1', false)).toBe('/path?hobby=bouldering&skill=edge%20s1')
    expect(skillLink(paths, 'uuid-1', 'x', true)).toBe('/path?demo=1&skill=x')
    expect(skillLink(paths, 'missing', 'x', false)).toBeNull()
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
    expect(page.match(/:show-save="!isDemo"/g)?.length).toBeGreaterThanOrEqual(4)
    const panel = readFileSync(new URL('../../app/components/fresh/FreshSourcesPanel.vue', import.meta.url), 'utf8')
    expect(panel).toMatch(/<FreshMuteSwitch\s+v-if="!demo"/)
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
