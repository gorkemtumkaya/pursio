// Feature: sample-path, Property 3: Preview labels
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { canvasPreview } from '../../app/utils/sample-view'
import { arbSamplePath } from '../arbitraries'

const DASH = /[-‐-―−﹘﹣－]/

describe('Property 3: Preview labels', () => {
  it('one status per skill and one header per section, the right sub labels, one banner, no dash', () => {
    fc.assert(
      fc.property(arbSamplePath, (sample) => {
        const preview = canvasPreview(sample)
        const skills = sample.sections.flatMap((s) => s.skills)

        expect(Object.keys(preview.status).sort()).toEqual(skills.map((k) => k.id).sort())
        const [first, ...rest] = skills
        expect(preview.status[first!.id]).toMatch(first!.videos.length === 0 ? /^3 quests$/ : /^3 quests · \d+ videos?$/)
        for (const k of rest) expect(preview.status[k.id]).toBe(k.milestone ? 'Milestone' : 'Tap to preview')

        expect(preview.headers).toHaveLength(sample.sections.length)
        expect(preview.headers.filter((h) => h.variant === 'banner')).toHaveLength(1)
        expect(preview.headers[0]!.variant).toBe('banner')
        for (const [i, h] of preview.headers.entries()) {
          if (i === 0) continue
          const before = sample.sections[i - 1]!.skills.some((k) => k.milestone)
          expect(h.note === null).toBe(!before)
        }

        // The sample text in the generator has no dash, so none may come from the preview.
        const texts = [preview.tag, ...Object.values(preview.status), ...preview.headers.flatMap((h) => [h.eyebrow, h.countText ?? '', h.note ?? ''])]
        expect(texts.filter((t) => DASH.test(t))).toEqual([])
      }),
      { numRuns: 100 },
    )
  })
})
