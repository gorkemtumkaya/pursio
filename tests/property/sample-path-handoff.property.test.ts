// Feature: sample-path, Property 4: Handoff never leaks the note
// Feature: sample-path, Property 5: Events
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CAMPAIGN_KEYS } from '../../shared/utils/sample-slugs'
import type { AnalyticsEvent, AnalyticsProps } from '../../app/utils/analytics'
import { createSampleTracker, utmProps, type MineSource } from '../../app/utils/sample-events'
import { HANDOFF_MAX_AGE_MS, handoffTarget, setSampleHandoff, takeSampleHandoff } from '../../app/utils/sample-handoff'

const RUNS = { numRuns: 100 }

const arbHobby = fc.constantFrom('Photography', 'Guitar', 'Birdwatching')
const arbNote = fc.string({ minLength: 0, maxLength: 900 })
const arbQuery = fc.dictionary(
  fc.oneof(fc.constantFrom(...CAMPAIGN_KEYS, 'note', 'ref'), fc.string({ maxLength: 8 })),
  fc.oneof(fc.string({ maxLength: 220 }), fc.array(fc.string({ maxLength: 20 }), { maxLength: 2 })),
  { maxKeys: 6 },
)

describe('Property 4: Handoff never leaks the note', () => {
  it('the target holds no note, and the note is taken once for its hobby within 60 s', () => {
    fc.assert(
      fc.property(arbHobby, arbNote, arbQuery, fc.integer({ min: 0, max: 2 * HANDOFF_MAX_AGE_MS }), (hobby, note, query, delay) => {
        const target = handoffTarget(hobby, query)
        expect(target.path).toBe('/new')
        expect(target.query.hobby).toBe(hobby)
        const trimmed = note.trim()
        // A note of 3 or more characters that the URL does not hold for another reason.
        const legitimate = Object.entries(target.query).some(([key, value]) => key !== 'hobby' && value.includes(trimmed))
        if (trimmed.length >= 3 && !hobby.includes(trimmed) && !legitimate) {
          for (const value of Object.values(target.query)) expect(value.includes(trimmed)).toBe(false)
        }
        for (const key of Object.keys(target.query)) expect(key === 'hobby' || (CAMPAIGN_KEYS as readonly string[]).includes(key)).toBe(true)

        setSampleHandoff(hobby, note, 0)
        const taken = takeSampleHandoff(hobby, delay)
        if (delay <= HANDOFF_MAX_AGE_MS) expect(taken).toBe(Array.from(trimmed).slice(0, 800).join(''))
        else expect(taken).toBeNull()
        expect(takeSampleHandoff(hobby, delay)).toBeNull()

        setSampleHandoff(hobby, note, 0)
        expect(takeSampleHandoff(`${hobby} lessons`, 0)).toBeNull()
      }),
      RUNS,
    )
  })
})

type Call = { kind: 'viewed' } | { kind: 'skill'; id: string } | { kind: 'mine'; source: MineSource } | { kind: 'build'; hasNote: boolean; skipped: boolean }

const arbCall: fc.Arbitrary<Call> = fc.oneof(
  fc.constant<Call>({ kind: 'viewed' }),
  fc.stringMatching(/^[a-z-]{1,12}$/).map((id): Call => ({ kind: 'skill', id })),
  fc.constantFrom<MineSource>('bar', 'skill_sheet', 'top_bar', 'note_focus').map((source): Call => ({ kind: 'mine', source })),
  fc.record({ hasNote: fc.boolean(), skipped: fc.boolean() }).map((b): Call => ({ kind: 'build', ...b })),
)

describe('Property 5: Events', () => {
  it('once-only events go at most once, and every event has the hobby, exactly the utm of the URL, and short plain values', () => {
    fc.assert(
      fc.property(fc.array(arbCall, { maxLength: 30 }), arbQuery, (calls, query) => {
        const events: { event: AnalyticsEvent; props: AnalyticsProps }[] = []
        const utm = utmProps(query)
        const tracker = createSampleTracker((event, props) => events.push({ event, props }), { hobby: 'guitar', ...utm })
        for (const call of calls) {
          if (call.kind === 'viewed') tracker.viewed()
          else if (call.kind === 'skill') tracker.skillOpened(call.id)
          else if (call.kind === 'mine') tracker.mineOpened(call.source)
          else tracker.buildClicked({ hasNote: call.hasNote, skipped: call.skipped })
        }
        for (const once of ['sample_viewed', 'sample_mine_opened', 'sample_build_clicked'] as const) {
          expect(events.filter((e) => e.event === once).length).toBeLessThanOrEqual(1)
        }
        expect(events.filter((e) => e.event === 'sample_skill_opened')).toHaveLength(calls.filter((c) => c.kind === 'skill').length)
        for (const { props } of events) {
          expect(props.hobby).toBe('guitar')
          const utmKeys = Object.keys(props).filter((k) => k.startsWith('utm_'))
          expect(utmKeys.sort()).toEqual(Object.keys(utm).sort())
          for (const value of Object.values(props)) {
            expect(typeof value === 'string' || typeof value === 'boolean').toBe(true)
            if (typeof value === 'string') expect(value.length).toBeLessThanOrEqual(200)
          }
        }
      }),
      RUNS,
    )
  })
})
