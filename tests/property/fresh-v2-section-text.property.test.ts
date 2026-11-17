// Feature: fresh-v2, Property 6: Section text and tags
// For any path and progress, the section shows `completedCount` and `totalCount` equal to the
// completed Skills and all Skills of the path, and `currentSkillTitle` equal to the title of its
// Current_Skill. Every card's tag is `next` exactly when its Skill is in the Current_Window and
// is not the Current_Skill.
// Validates: Requirements 4.3, 5.4, 12.6
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshResponseOk } from '../../shared/types/fresh'
import { buildFreshView, type FreshViewInput } from '../../shared/utils/fresh-view'
import { findCurrentNodeId } from '../../shared/utils/progress-engine'
import { requestPath } from '../../app/utils/fresh-request'
import { handleFreshRequest } from '../../server/utils/fresh/handlers'
import { allNodes, arbColorSlot, arbProgress, arbValidTree } from '../arbitraries'
import { arbSectionInput } from '../support/fresh-arbitraries'
import { createFreshEndpointHarness } from '../support/fresh-route-fakes'

const RUNS = { numRuns: 150 }

function checkText(input: FreshViewInput): void {
  const view = buildFreshView(input)
  const tags = [...view.sections.flatMap((s) => s.cards.map((c) => ({ pathId: s.pathId, skillId: c.match.skillId, tag: c.tag })))]
  for (const section of view.sections) {
    const path = input.response.paths.find((p) => p.id === section.pathId)!
    expect(section.completedCount).toBe(path.completedCount)
    expect(section.totalCount).toBe(path.skills.length)
    expect(section.hobby).toBe(path.hobby)
    expect(section.colorSlot).toBe(path.colorSlot)
    expect(section.letter).toBe([...path.hobby.trim()][0]!.toLocaleUpperCase())
    if (path.currentSkillId === null) {
      // "Path finished" (Req 4.8).
      expect(section.currentSkillTitle).toBeNull()
      expect(section.state).toBe('finished')
    } else {
      expect(section.currentSkillTitle).toBe(path.skills.find((s) => s.id === path.currentSkillId)?.title)
      // "No videos yet" exactly when no card is left (Req 4.9).
      expect(section.state).toBe(section.cards.length === 0 ? 'empty' : 'cards')
    }
  }
  for (const { pathId, skillId, tag } of tags) {
    const path = input.response.paths.find((p) => p.id === pathId)!
    const isCurrent = skillId === path.currentSkillId
    const inWindow = path.windowSkillIds.includes(skillId)
    // "Next: <title>" only for the other Skills of the Current_Window (Req 5.4).
    expect(tag === 'next').toBe(inWindow && !isCurrent)
    expect(tag === 'current').toBe(isCurrent)
    expect(tag === 'other').toBe(!inWindow && !isCurrent)
  }
}

describe('Feature: fresh-v2, Property 6: Section text and tags', () => {
  it('shows the path counts and the Current_Skill title, and tags "next" only inside the Current_Window', () => {
    fc.assert(
      fc.property(arbSectionInput({ maxItems: 30, maxPool: 6 }), (input) => {
        checkText(input)
        for (const p of input.response.paths) checkText({ ...input, chip: { kind: 'path', pathId: p.id } })
      }),
      RUNS,
    )
  })

  it('carries the completed and total Skills of a tree and its Progress from the request to the section', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidTree.chain((tree) => fc.record({ tree: fc.constant(tree), progress: arbProgress(tree), slot: arbColorSlot })),
        async ({ tree, progress, slot }) => {
          const path = requestPath('local-path', tree, progress, slot)
          expect(path).not.toBeNull()
          const h = createFreshEndpointHarness()
          const result = await handleFreshRequest(
            { body: { language: 'en', paths: [path] }, authorization: undefined, clientIp: '198.51.100.9' },
            h.deps,
          )
          expect(result.status).toBe(200)
          const response = result.body as FreshResponseOk
          const section = buildFreshView({ response, chip: { kind: 'all' }, mutes: new Map(), events: [], demo: false })
            .sections[0]!

          const nodes = allNodes(tree)
          const completed = new Set(progress.completed)
          expect(section.totalCount).toBe(nodes.length)
          expect(section.completedCount).toBe(nodes.filter((n) => completed.has(n.id)).length)
          expect(section.colorSlot).toBe(slot)
          const current = findCurrentNodeId(tree, progress)
          const title = current === null ? null : nodes.find((n) => n.id === current)!.title.trim()
          expect(section.currentSkillTitle).toBe(title)
          expect(section.state).toBe(current === null ? 'finished' : 'empty')
        },
      ),
      RUNS,
    )
  })
})
