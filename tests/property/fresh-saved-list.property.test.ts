// Feature: fresh, Property 32: Saved list
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SaveSnapshot } from '../../shared/types/fresh'
import type { VideoEvent } from '../../shared/types/video'
import { compareCodePoints } from '../../shared/utils/fresh-keys'
import { buildFreshView, isAllowedThumbnail } from '../../shared/utils/fresh-view'
import { arbEvents, arbMutes, arbViewInput, isMuted, makeResponse } from '../support/fresh-arbitraries'

const RUNS = { numRuns: 300 }

/**
 * Independent oracle for Req 14.6: per video, the combined saved value is the saved value of the
 * record with the latest Saved_Time (null earliest), true when several records share that time;
 * the snapshot comes from the video's `feed` record.
 */
function expectedSaved(
  events: readonly VideoEvent[],
  mutes: ReadonlyMap<string, boolean>,
): { videoId: string; savedAt: number; snapshot: SaveSnapshot }[] {
  const ids = [...new Set(events.map((e) => e.videoId))]
  const out: { videoId: string; savedAt: number; snapshot: SaveSnapshot }[] = []
  for (const videoId of ids) {
    const recs = events.filter((e) => e.videoId === videoId)
    const times = recs.map((r) => r.savedAt).filter((t): t is number => t !== null)
    const latest = times.length === 0 ? null : Math.max(...times)
    const saved = recs.filter((r) => r.savedAt === latest).some((r) => r.saved)
    if (!saved || latest === null) continue
    const snapshot = recs.find((r) => r.source === 'feed')?.snapshot ?? null
    if (snapshot === null || isMuted(mutes, snapshot.channelId)) continue
    out.push({ videoId, savedAt: latest, snapshot })
  }
  return out.sort((a, b) => b.savedAt - a.savedAt || compareCodePoints(a.videoId, b.videoId))
}

describe('Feature: fresh, Property 32: Saved list', () => {
  it('lists exactly the saved videos with a non-muted snapshot, by Saved_Time desc then id asc', () => {
    /** **Validates: Requirements 14.6** */
    fc.assert(
      fc.property(arbViewInput, arbEvents, arbMutes, (input, events, mutes) => {
        const view = buildFreshView({ ...input, chip: { kind: 'saved' }, events, mutes, demo: false })
        expect(view.chip).toEqual({ kind: 'saved' })
        const expected = expectedSaved(events, mutes)
        expect(view.saved.map((s) => s.videoId)).toEqual(expected.map((e) => e.videoId))
        view.saved.forEach((card, i) => {
          const want = expected[i]!
          expect(card.savedAt).toBe(want.savedAt)
          // Shown with the snapshot's title, channel, thumbnail and duration.
          expect(card.snapshot.title).toBe(want.snapshot.title)
          expect(card.snapshot.channel).toBe(want.snapshot.channel)
          expect(card.snapshot.thumbnailUrl).toBe(want.snapshot.thumbnailUrl)
          expect(card.snapshot.durationSeconds).toBe(want.snapshot.durationSeconds)
          expect(card.thumbnailAllowed).toBe(isAllowedThumbnail(want.snapshot.thumbnailUrl))
        })
      }),
      RUNS,
    )
  })

  it('does not depend on whether the video is still in the response', () => {
    /** **Validates: Requirements 14.6** */
    fc.assert(
      fc.property(arbViewInput, (input) => {
        const withResponse = buildFreshView({ ...input, chip: { kind: 'saved' }, demo: false })
        const bare = buildFreshView({
          ...input,
          chip: { kind: 'saved' },
          demo: false,
          response: makeResponse({ paths: input.response.paths }),
        })
        expect(withResponse.saved).toEqual(bare.saved)
      }),
      RUNS,
    )
  })
})
