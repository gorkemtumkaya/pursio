// Property tests for app/utils/section-headers.ts (spec: skill-path-ui).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Progress } from '../../shared/types/progress'
import type { SkillTree } from '../../shared/types/skill-tree'
import { sectionHeaderModels } from '../../app/utils/section-headers'
import { arbProgress, arbValidTree } from '../arbitraries'

const RUNS = { numRuns: 200 }

const arbTreeAndProgress: fc.Arbitrary<{ tree: SkillTree; progress: Progress }> = arbValidTree.chain(tree =>
  arbProgress(tree).map(progress => ({ tree, progress })),
)

/** Independent oracle: the Section holding the first available Main_Node, else the last Section. */
function oracleActiveSection(tree: SkillTree, progress: Progress): number {
  const done = new Set(progress.completed)
  for (const [index, section] of tree.sections.entries()) {
    const hasCurrent = section.nodes.some(
      node => !node.optional && !done.has(node.id) && node.prerequisites.every(id => done.has(id)),
    )
    if (hasCurrent) return index
  }
  return tree.sections.length - 1
}

describe('sectionHeaderModels', () => {
  // Feature: skill-path-ui, Property 22: Section headers have one banner and correct counts
  it('returns one header per Section with exactly one banner and correct counts and locks', () => {
    // **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
    fc.assert(
      fc.property(arbTreeAndProgress, ({ tree, progress }) => {
        const done = new Set(progress.completed)
        const headers = sectionHeaderModels(tree, progress)
        const active = oracleActiveSection(tree, progress)

        // 7.1: one header per Section, in order, with eyebrow and title.
        expect(headers).toHaveLength(tree.sections.length)
        tree.sections.forEach((section, index) => {
          const header = headers[index]
          expect(header).toBeDefined()
          if (header === undefined) return
          expect(header.index).toBe(index)
          expect(header.title).toBe(section.title)
          expect(header.eyebrow).toBe(`SECTION ${index + 1} · ${section.level.toUpperCase()}`)
        })

        // 7.2: exactly one banner, at the Active_Section.
        const banners = headers.filter(header => header.variant === 'banner')
        expect(banners).toHaveLength(1)
        expect(banners[0]?.index).toBe(active)

        headers.forEach((header, index) => {
          const section = tree.sections[index]
          if (section === undefined) return
          if (header.variant === 'banner') {
            // 7.2: count of completed Main_Nodes over Main_Nodes, side quests excluded.
            const main = section.nodes.filter(node => !node.optional)
            expect(header.count).not.toBeNull()
            if (header.count === null) return
            expect(header.count.total).toBe(main.length)
            expect(header.count.done).toBe(main.filter(node => done.has(node.id)).length)
            expect(header.count.done).toBeGreaterThanOrEqual(0)
            expect(header.count.done).toBeLessThanOrEqual(header.count.total)
            expect(header.lockedBy).toBeNull()
            return
          }
          // 7.3: dividers have no count.
          expect(header.count).toBeNull()
          // 7.4, 7.5: locked exactly when the previous Section has an incomplete Milestone_Node.
          const previous = index > 0 ? tree.sections[index - 1] : undefined
          const blockers = previous?.nodes.filter(node => node.milestone && !done.has(node.id)) ?? []
          if (blockers.length === 0) {
            expect(header.lockedBy).toBeNull()
          }
          else {
            expect(blockers.map(node => node.title)).toContain(header.lockedBy)
          }
        })
      }),
      RUNS,
    )
  })
})
