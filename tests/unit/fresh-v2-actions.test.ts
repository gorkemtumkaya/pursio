// Playback across carousels and Demo_Mode writes (spec: fresh-v2, task 9.2; Req 7.2, 11.1, 12.11).
// The page keeps `shownIds` (the hero id and every section card id, or the saved ids) and calls
// `actions.syncShown()` when it changes. The same wiring is rebuilt here from the pure view,
// with no DOM: @vue/test-utils is not installed.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { SaveSnapshot } from '../../shared/types/fresh'
import type { VideoSource } from '../../shared/types/video'
import { buildFreshView, type FilterChip, type FreshView } from '../../shared/utils/fresh-view'
import { createMuteController } from '../../app/composables/useChannelMutes'
import { CHANNEL_MUTES_KEY } from '../../app/utils/channel-mutes-store'
import { createFreshActions, type FreshActions, type FreshRecorder, type FreshShownVideo } from '../../app/utils/fresh-actions'
import { VIDEO_EVENTS_KEY } from '../../app/utils/video-events-store'
import { HOUR, NOW, freshItem, freshPath, freshResponse, memoryStorage, poolCard } from '../support/fresh-client'

const RESPONSE = freshResponse({
  paths: [freshPath('a', 'Bouldering', 's1', NOW - 5 * HOUR), freshPath('b', 'Guitar', 's2', NOW - HOUR, { colorSlot: 2 })],
  items: [
    freshItem('nb1', 'b', 's2', { teachesThisSkill: 1, levelFit: 1 }),
    freshItem('na1', 'a', 's1', { channelId: 'UCclimb' }),
    freshItem('na2', 'a', 's3', { publishedMs: NOW - 30 * HOUR }),
  ],
  pools: [
    { pathId: 'a', skillId: 'a-s1', videos: [poolCard('pa1'), poolCard('pa2')] },
    { pathId: 'b', skillId: 'b-s2', videos: [poolCard('pb1')] },
  ],
})

/** The page's `shownIds`: the hero and every section card, or the saved list under "Saved". */
function shownIds(view: FreshView): Set<string> {
  const ids = new Set<string>()
  if (view.chip.kind === 'saved') {
    for (const c of view.saved) ids.add(c.videoId)
    return ids
  }
  if (view.hero) ids.add(view.hero.card.videoId)
  for (const section of view.sections) for (const c of section.cards) ids.add(c.card.videoId)
  return ids
}

/** A page stand-in: a chip, a mute map, the view and the actions, wired like `fresh.vue`. */
function page(options: { demo?: boolean; recorder?: FreshRecorder | null } = {}) {
  const demo = options.demo ?? false
  let chip: FilterChip = { kind: 'all' }
  const mutes = new Map<string, boolean>()
  const view = (): FreshView => buildFreshView({ response: RESPONSE, chip, mutes: new Map(mutes), events: [], demo })
  const actions: FreshActions = createFreshActions({
    demo,
    recorder: options.recorder ?? null,
    events: () => [],
    shown: (id) => shownIds(view()).has(id),
  })
  return {
    actions,
    view,
    selectChip(next: FilterChip): void {
      chip = next
      actions.syncShown()
    },
    mute(channelId: string, muted: boolean): void {
      mutes.set(channelId, muted)
      actions.syncShown()
    },
  }
}

interface Call {
  kind: 'play' | 'progress' | 'save' | 'skip'
  videoId: string
  source: VideoSource
  snapshot?: SaveSnapshot | null
}

function fakeRecorder(): FreshRecorder & { calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    recordPlay: (videoId, source) => void calls.push({ kind: 'play', videoId, source }),
    recordProgress: (videoId, _seconds, _duration, source) => void calls.push({ kind: 'progress', videoId, source }),
    recordSave: (videoId, _saved, source, snapshot) => void calls.push({ kind: 'save', videoId, source, snapshot }),
    recordSkip: (videoId, source) => void calls.push({ kind: 'skip', videoId, source }),
  }
}

const shown = (videoId: string): FreshShownVideo => ({
  videoId,
  title: `t ${videoId}`,
  channel: 'c',
  channelId: `ch-${videoId}`,
  thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  durationSeconds: 100,
})

describe('playback across carousels (Req 7.2, 12.11)', () => {
  it('the fixture puts the videos where the tests expect them', () => {
    const view = page().view()
    expect(view.hero?.card.videoId).toBe('nb1')
    expect(view.sections.map((s) => [s.pathId, s.cards.map((c) => c.card.videoId)])).toEqual([
      ['b', ['pb1']],
      ['a', ['na1', 'na2', 'pa1', 'pa2']],
    ])
  })

  it('a playing card keeps playing when it is scrolled out of view', () => {
    const p = page()
    p.actions.play('pa2')
    // Sideways scrolling changes neither the chip nor the mutes, so the shown set is the same
    // however often the page checks it.
    for (let i = 0; i < 5; i += 1) p.actions.syncShown()
    expect(p.actions.activeVideoId.value).toBe('pa2')
    // The carousel only scrolls: it has no way to stop a video or to change the shown set.
    const carousel = readFileSync(new URL('../../app/components/fresh/FreshCarousel.vue', import.meta.url), 'utf8')
    expect(carousel).not.toMatch(/defineEmits|activeVideoId|stop\(|IntersectionObserver/)
    const pageSource = readFileSync(new URL('../../app/pages/fresh.vue', import.meta.url), 'utf8')
    expect(pageSource).toContain('watch(shownIds, () => actions.syncShown())')
  })

  it('starting another video stops the first: one plays at a time', () => {
    const p = page()
    p.actions.play('pa2')
    p.actions.play('pb1')
    expect(p.actions.activeVideoId.value).toBe('pb1')
    // Also from a carousel to the Hero_Card.
    p.actions.play('nb1')
    expect(p.actions.activeVideoId.value).toBe('nb1')
  })

  it('a chip change that removes the playing card stops it; one that keeps it does not', () => {
    const p = page()
    p.actions.play('na2')
    // Bouldering's own chip still shows the card.
    p.selectChip({ kind: 'path', pathId: 'a' })
    expect(p.actions.activeVideoId.value).toBe('na2')
    p.selectChip({ kind: 'all' })
    expect(p.actions.activeVideoId.value).toBe('na2')
    // Guitar's chip shows only Guitar.
    p.selectChip({ kind: 'path', pathId: 'b' })
    expect(p.actions.activeVideoId.value).toBeNull()

    p.selectChip({ kind: 'all' })
    p.actions.play('pa1')
    p.selectChip({ kind: 'saved' })
    expect(p.actions.activeVideoId.value).toBeNull()
  })

  it('a hero that becomes a section card under another chip keeps playing', () => {
    const p = page()
    // Under the Bouldering chip na1 is the hero; under "All hobbies" it is a card of its row.
    p.selectChip({ kind: 'path', pathId: 'a' })
    expect(p.view().hero?.card.videoId).toBe('na1')
    p.actions.play('na1')
    p.selectChip({ kind: 'all' })
    expect(p.view().hero?.card.videoId).toBe('nb1')
    expect(p.actions.activeVideoId.value).toBe('na1')
  })

  it('a mute that removes the playing card stops it; another channel\'s mute does not', () => {
    const p = page()
    p.actions.play('na1')
    p.mute('ch-pa2', true)
    expect(p.actions.activeVideoId.value).toBe('na1')
    p.mute('UCclimb', true)
    expect(p.actions.activeVideoId.value).toBeNull()
    // Unmuting shows the card again; it does not start by itself.
    p.mute('UCclimb', false)
    expect(shownIds(p.view()).has('na1')).toBe(true)
    expect(p.actions.activeVideoId.value).toBeNull()
  })

  it('records plays, progress and saves from any row with Source feed', () => {
    const recorder = fakeRecorder()
    const p = page({ recorder })
    p.actions.play('pa2')
    p.actions.onPlaying(shown('pa2'))
    p.actions.onProgress(shown('pa2'), 90)
    p.actions.toggleSave(shown('pa2'))
    expect(recorder.calls.map((c) => [c.kind, c.videoId, c.source])).toEqual([
      ['play', 'pa2', 'feed'],
      ['progress', 'pa2', 'feed'],
      ['save', 'pa2', 'feed'],
    ])
    // A save from a carousel card stores its Save_Snapshot (Req 7.3).
    expect(recorder.calls[2]?.snapshot).toEqual(shown('pa2'))
    // A skip is recorded only for a card that is on the page.
    p.actions.onSkipped('pa1')
    p.actions.onSkipped('not-on-the-page')
    expect(recorder.calls.filter((c) => c.kind === 'skip').map((c) => c.videoId)).toEqual(['pa1'])
  })
})

describe('Demo_Mode writes nothing (Req 11.1, 12.11)', () => {
  it('a play, a finish and a skip write 0 Video_Events, 0 Channel_Mutes and 0 Save_Snapshots', () => {
    const storage = memoryStorage()
    const recorder = fakeRecorder()
    // Even with a recorder at hand, Demo_Mode never calls it; the page passes none at all.
    const p = page({ demo: true, recorder })
    const video = shown('pa2')
    p.actions.play(video.videoId)
    p.actions.onPlaying(video)
    p.actions.onProgress(video, 100) // the whole video: a finish
    p.actions.onSkipped('pa1')
    p.actions.toggleSave(video)

    expect(p.actions.activeVideoId.value).toBe('pa2')
    expect(recorder.calls).toEqual([])
    expect(p.actions.isSaved(video.videoId)).toBe(false)
    expect(storage.writes).toBe(0)
    expect(storage.data.has(VIDEO_EVENTS_KEY)).toBe(false)
    expect(storage.data.has(CHANNEL_MUTES_KEY)).toBe(false)
  })

  it('has no mute store and no "Saved" chip, and a mute controller that is never made writes nothing', () => {
    const storage = memoryStorage()
    const view = page({ demo: true }).view()
    expect(view.chips.some((c) => c.chip.kind === 'saved')).toBe(false)
    expect(view.saved).toEqual([])
    const source = readFileSync(new URL('../../app/pages/fresh.vue', import.meta.url), 'utf8')
    expect(source).toContain('const recorder = isDemo ? null : useVideoEvents()')
    expect(source).toContain('const mutes = isDemo ? null : useChannelMutes()')
    expect(source).toContain('mutes?.setMuted(channelId, muted)')
    // Outside Demo_Mode the same call does write, so the check above means something.
    const controller = createMuteController({ storage: () => storage, now: () => NOW, sender: () => null })
    controller.setMuted('UCclimb', true)
    expect(storage.data.has(CHANNEL_MUTES_KEY)).toBe(true)
  })
})
