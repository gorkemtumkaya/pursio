// Feature: fresh, Property 34: Sources panel
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshResponseOk } from '../../shared/types/fresh'
import { compareCodePoints } from '../../shared/utils/fresh-keys'
import { buildFreshView } from '../../shared/utils/fresh-view'
import { normalizeText } from '../../shared/utils/video-normalize'
import { arbChip, arbViewInput, isMuted } from '../support/fresh-arbitraries'

const RUNS = { numRuns: 300 }

/** Independent oracle for Req 15.1, 15.2, 15.8: one group per hobby in path-chip order. */
function expectedGroups(response: FreshResponseOk, mutes: ReadonlyMap<string, boolean>) {
  const groups: { hobby: string; entries: { channelId: string; channelName: string; muted: boolean }[] }[] = []
  const seen = new Set<string>()
  for (const p of response.paths) {
    const hobby = normalizeText(p.hobby)
    // Paths whose hobbies are equal after Normalization share one hobby group.
    if (seen.has(hobby)) continue
    seen.add(hobby)
    // Check_Keys of the path: (hobby, user language) and (hobby, en).
    const languages = new Set([response.language, 'en'])
    const sources = response.sources.filter((s) => normalizeText(s.hobby) === hobby && languages.has(s.language))
    const byId = new Map<string, string>()
    for (const s of sources) if (!byId.has(s.channelId)) byId.set(s.channelId, s.channelName)
    const entries = [...byId]
      .map(([channelId, channelName]) => ({ channelId, channelName, muted: isMuted(mutes, channelId) }))
      .sort(
        (a, b) =>
          compareCodePoints(a.channelName.toLowerCase(), b.channelName.toLowerCase())
          || compareCodePoints(a.channelId, b.channelId),
      )
    groups.push({ hobby: p.hobby, entries })
  }
  return groups
}

describe('Feature: fresh, Property 34: Sources panel', () => {
  it('groups Channel_Sources per hobby, one entry per channel id, sorted, muted ones kept', () => {
    /** **Validates: Requirements 2.9, 15.1, 15.2, 15.7, 15.8** */
    fc.assert(
      fc.property(arbViewInput, (input) => {
        const view = buildFreshView(input)
        const expected = expectedGroups(input.response, input.mutes)
        expect(view.sources.map((g) => ({ hobby: g.hobby, entries: g.entries }))).toEqual(expected)

        const switchOf = new Map<string, boolean>()
        for (const group of view.sources) {
          // Each channel id at most once per group; a group with no entries shows the empty line.
          const ids = group.entries.map((e) => e.channelId)
          expect(new Set(ids).size).toBe(ids.length)
          for (const e of group.entries) {
            // Switch off exactly when the latest mute is true (Req 2.9, 15.2).
            expect(e.muted).toBe(input.mutes.get(e.channelId) === true)
            // Same state in every group (Req 15.7).
            const prior = switchOf.get(e.channelId)
            if (prior !== undefined) expect(e.muted).toBe(prior)
            switchOf.set(e.channelId, e.muted)
          }
        }
        // Muted channels stay listed: every channel id of a matching source is shown.
        const shown = new Set(view.sources.flatMap((g) => g.entries.map((e) => e.channelId)))
        const listed = new Set(expected.flatMap((g) => g.entries.map((e) => e.channelId)))
        expect(shown).toEqual(listed)
      }),
      RUNS,
    )
  })

  it('lists the same groups whichever chip is selected', () => {
    /** **Validates: Requirements 15.1** */
    const arbCase = arbViewInput.chain((input) => arbChip(input.response.paths).map((chip) => ({ input, chip })))
    fc.assert(
      fc.property(arbCase, ({ input, chip }) => {
        expect(buildFreshView({ ...input, chip }).sources).toEqual(buildFreshView(input).sources)
      }),
      RUNS,
    )
  })
})
