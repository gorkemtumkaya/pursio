// Acceptance check 7 (spec: sample-path, Req 2.5, 14.5, 16.7): a Sample with 3 sections and 14
// skills and one with 2 sections and 9 skills both lay out without overlap, and at 360 px every
// node stays inside the column and every label keeps its full width.
import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import type { ViewportClass } from '../../shared/types/viewport'
import type { SampleSlug } from '../../shared/types/sample-path'
import { sampleCounts, sampleToTree } from '../../shared/utils/sample-path'
import { SAMPLE_SLUGS } from '../../shared/utils/sample-slugs'
import { computePathLayout, type PathLayout } from '../../app/utils/path-layout'
import { getSample } from '../../app/utils/sample-paths'

/** Half the narrowest column: a 360 px phone, and the 640 px main column on desktop. */
const HALF_COLUMN: Record<ViewportClass, number> = { mobile: 180, desktop: 320 }
/** Label metrics of PathCanvas: gap after the node, reference width, and the 4 px it keeps free. */
const LABEL: Record<ViewportClass, { gap: number; width: number }> = {
  mobile: { gap: 14, width: 104 },
  desktop: { gap: 16, width: 150 },
}

async function layoutOf(slug: SampleSlug, viewport: ViewportClass): Promise<PathLayout> {
  const sample = getSample(slug)
  if (!sample) throw new Error(`${slug} did not load`)
  const result = await computePathLayout(sampleToTree(sample), viewport, new ELK())
  if (!result.ok) throw new Error(JSON.stringify(result.errors))
  return result.value
}

describe('the sample sizes of the acceptance check', () => {
  it('photography has 3 sections and 14 skills, guitar 2 sections and 9 skills', () => {
    expect(sampleCounts(getSample('photography')!)).toEqual({ sections: 3, skills: 14 })
    expect(sampleCounts(getSample('guitar')!)).toEqual({ sections: 2, skills: 9 })
  })
})

describe.each(SAMPLE_SLUGS)('layout of %s', (slug) => {
  describe.each<ViewportClass>(['mobile', 'desktop'])('on %s', (viewport) => {
    it('places every skill once and one header per section', async () => {
      const layout = await layoutOf(slug, viewport)
      const sample = getSample(slug)!
      expect(Object.keys(layout.nodes).sort()).toEqual(sample.sections.flatMap((s) => s.skills.map((k) => k.id)).sort())
      expect(layout.headers).toHaveLength(sample.sections.length)
      expect(Object.values(layout.nodes).every((node) => node.kind !== 'side')).toBe(true)
    })

    it('no two nodes overlap, and no node sits in a header band', async () => {
      const layout = await layoutOf(slug, viewport)
      const nodes = Object.values(layout.nodes)
      for (const [i, a] of nodes.entries()) {
        for (const b of nodes.slice(i + 1)) {
          const apartX = Math.abs(a.cx - b.cx) >= (a.size + b.size) / 2
          const apartY = Math.abs(a.cy - b.cy) >= (a.size + b.size) / 2
          expect(apartX || apartY, `${a.id} overlaps ${b.id}`).toBe(true)
        }
        for (const header of layout.headers) {
          const top = a.cy - a.size / 2
          const bottom = a.cy + a.size / 2
          expect(bottom <= header.top || top >= header.top + header.height, `${a.id} is in header ${header.sectionIndex}`).toBe(true)
        }
      }
      expect(Math.max(...nodes.map((n) => n.cy + n.size / 2))).toBeLessThanOrEqual(layout.height)
    })

    it('every node fits the narrowest column and every label keeps its full width', async () => {
      const layout = await layoutOf(slug, viewport)
      const half = HALF_COLUMN[viewport]
      const { gap, width } = LABEL[viewport]
      for (const node of Object.values(layout.nodes)) {
        expect(Math.abs(node.cx) + node.size / 2, `${node.id} leaves the column`).toBeLessThanOrEqual(half)
        const available = half - (node.cx + node.size / 2 + gap) - 4
        expect(available, `${node.id} label is narrowed`).toBeGreaterThanOrEqual(width)
      }
    })
  })
})
