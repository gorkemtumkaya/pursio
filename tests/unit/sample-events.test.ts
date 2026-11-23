// The four sample page events (spec: sample-path, Requirement 11; acceptance check 6).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { AnalyticsEvent, AnalyticsProps } from '../../app/utils/analytics'
import { createSampleTracker, utmProps } from '../../app/utils/sample-events'

function recorder() {
  const events: { event: AnalyticsEvent; props: AnalyticsProps }[] = []
  return { events, send: (event: AnalyticsEvent, props: AnalyticsProps) => events.push({ event, props }) }
}

describe('acceptance check 6: the four events', () => {
  it('a walk through sends each event once, with the hobby and the utm properties', () => {
    const { events, send } = recorder()
    const utm = utmProps({ utm_source: 'reddit', utm_medium: 'paid', utm_campaign: 'nov', ref: 'x', gclid: 'y' })
    const tracker = createSampleTracker(send, { hobby: 'guitar', ...utm })

    tracker.viewed()
    tracker.skillOpened('barre-chords')
    tracker.mineOpened('bar')
    tracker.buildClicked({ hasNote: true, skipped: false })

    expect(events).toEqual([
      { event: 'sample_viewed', props: { hobby: 'guitar', utm_source: 'reddit', utm_medium: 'paid', utm_campaign: 'nov' } },
      { event: 'sample_skill_opened', props: { hobby: 'guitar', utm_source: 'reddit', utm_medium: 'paid', utm_campaign: 'nov', skill_id: 'barre-chords' } },
      { event: 'sample_mine_opened', props: { hobby: 'guitar', utm_source: 'reddit', utm_medium: 'paid', utm_campaign: 'nov', source: 'bar' } },
      { event: 'sample_build_clicked', props: { hobby: 'guitar', utm_source: 'reddit', utm_medium: 'paid', utm_campaign: 'nov', has_note: true, skipped: false } },
    ])
  })

  it('without utm in the URL, the events carry the hobby only', () => {
    const { events, send } = recorder()
    createSampleTracker(send, { hobby: 'photography', ...utmProps({}) }).viewed()
    expect(events).toEqual([{ event: 'sample_viewed', props: { hobby: 'photography' } }])
  })

  it('viewed, mine opened and build clicked go once per page load; skill opened every time', () => {
    const { events, send } = recorder()
    const tracker = createSampleTracker(send, { hobby: 'birdwatching' })
    tracker.viewed()
    tracker.viewed()
    tracker.mineOpened('note_focus')
    tracker.mineOpened('bar')
    tracker.skillOpened('a')
    tracker.skillOpened('a')
    tracker.buildClicked({ hasNote: false, skipped: true })
    tracker.buildClicked({ hasNote: true, skipped: false })
    expect(events.map((e) => e.event)).toEqual([
      'sample_viewed',
      'sample_mine_opened',
      'sample_skill_opened',
      'sample_skill_opened',
      'sample_build_clicked',
    ])
    expect(events[1]?.props.source).toBe('note_focus')
    expect(events[4]?.props).toEqual({ hobby: 'birdwatching', has_note: false, skipped: true })
  })
})

describe('utmProps', () => {
  it('keeps the five utm keys with a string of 1 to 200 characters, the first of a list', () => {
    expect(
      utmProps({ utm_source: ['reddit', 'x'], utm_term: '', utm_content: 'c'.repeat(201), utm_id: '7', rdt_cid: 'z', utm_medium: 3 }),
    ).toEqual({ utm_source: 'reddit' })
  })
})

describe('the page wiring', () => {
  const view = readFileSync(fileURLToPath(new URL('../../app/components/sample/SampleView.vue', import.meta.url)), 'utf8')

  it('sends sample_viewed after mount, so the prerender sends nothing (Req 11.3)', () => {
    expect(view).toMatch(/onMounted\(\(\) => tracker\.viewed\(\)\)/)
  })

  it('never passes the note to the tracker: only whether there is one (Req 11.7)', () => {
    const calls = view.match(/tracker\.buildClicked\([^)]*\)/g) ?? []
    expect(calls).toEqual(["tracker.buildClicked({ hasNote: text !== '', skipped })"])
  })
})
