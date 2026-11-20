// Property tests for app/utils/path-layout.ts (spec: skill-path-ui).
import ELK from 'elkjs/lib/elk.bundled.js'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SkillTree } from '../../shared/types/skill-tree'
import type { ViewportClass } from '../../shared/types/viewport'
import { computePathLayout, LAYOUT_CONFIG, trailStart, type PathLayout } from '../../app/utils/path-layout'
import { segmentTone } from '../../app/utils/node-visual'
import { deriveNodeStates } from '../../shared/utils/progress-engine'
import { allNodes, arbPathTree, arbProgress, mainNodes, sideQuestNodes } from '../arbitraries'

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

/** One elkjs instance for every run. */
const elk = new ELK()

const RUNS = { numRuns: 100 }

/** 100 async elkjs runs per viewport class can exceed vitest's 5 s default. */
const TIMEOUT_MS = 60_000

const VIEWPORTS: readonly ViewportClass[] = ['mobile', 'desktop']

/** Computes the layout and fails the run if it is not ok. */
async function layoutOk(tree: SkillTree, viewport: ViewportClass): Promise<PathLayout> {
  const result = await computePathLayout(tree, viewport, elk)
  if (!result.ok) throw new Error(`layout failed (${viewport}): ${JSON.stringify(result.errors)}`)
  return result.value
}

/** Section index of each id's first occurrence. */
function sectionOf(tree: SkillTree): Map<string, number> {
  const sections = new Map<string, number>()
  tree.sections.forEach((section, index) => {
    for (const node of section.nodes) if (!sections.has(node.id)) sections.set(node.id, index)
  })
  return sections
}

// ---------------------------------------------------------------------------
// Property 16
// ---------------------------------------------------------------------------

describe('Property 16: Main nodes follow the winding trail', () => {
  // Feature: skill-path-ui, Property 16: Main nodes follow the winding trail
  // **Validates: Requirements 5.2, 5.3, 5.4, 5.6**
  it('places Main_Nodes on the winding offsets, rowGap apart unless a side quest sits between them, with per-kind box sizes', async () => {
    await fc.assert(
      fc.asyncProperty(arbPathTree, async (tree) => {
        const mains = mainNodes(tree)
        const sides = sideQuestNodes(tree)
        const sections = sectionOf(tree)
        for (const viewport of VIEWPORTS) {
          const cfg = LAYOUT_CONFIG[viewport]
          const layout = await layoutOk(tree, viewport)

          expect(layout.mainOrder).toEqual(mains.map(node => node.id))

          mains.forEach((node, i) => {
            const p = layout.nodes[node.id]
            expect(p, `${viewport}: no placement for ${node.id}`).toBeDefined()
            if (!p) return
            expect(p.cx).toBe(cfg.windingOffsets[i % 4])
            expect(p.size).toBe(node.milestone ? cfg.size.milestone : cfg.size.main)

            const prev = mains[i - 1]
            const q = prev === undefined ? undefined : layout.nodes[prev.id]
            if (!prev || !q) return
            expect(p.cy).toBeGreaterThan(q.cy)
            if (sections.get(prev.id) !== sections.get(node.id)) return
            const sideBetween = sides.some((side) => {
              const s = layout.nodes[side.id]
              return s !== undefined && q.cy < s.cy && s.cy < p.cy
            })
            if (sideBetween) expect(p.cy - q.cy).toBeGreaterThan(cfg.rowGap)
            else expect(p.cy - q.cy).toBe(cfg.rowGap)
          })

          for (const node of sides) expect(layout.nodes[node.id]?.size).toBe(cfg.size.side)
        }
      }),
      RUNS,
    )
  }, TIMEOUT_MS)
})

// ---------------------------------------------------------------------------
// Property 17
// ---------------------------------------------------------------------------

interface Band { top: number; bottom: number }

/** Strict overlap, the same test `placePath` uses when pushing a side quest down. */
function overlaps(a: Band, b: Band): boolean {
  return a.top < b.bottom && b.top < a.bottom
}

describe('Property 17: Side quests sit on the side column, between the labels of two Main_Nodes', () => {
  // Feature: skill-path-ui, Property 17: Side quests sit on the side column, between the labels of two Main_Nodes
  // **Validates: Requirements 5.5**
  it('places every Side_Quest_Node at sideX, below the label of the Main_Node above it and above the label of the next one', async () => {
    await fc.assert(
      fc.asyncProperty(arbPathTree, async (tree) => {
        const sides = sideQuestNodes(tree)
        for (const viewport of VIEWPORTS) {
          const cfg = LAYOUT_CONFIG[viewport]
          const layout = await layoutOk(tree, viewport)
          const mainPosition = new Map(layout.mainOrder.map((id, i) => [id, i]))
          /** Top edge of the highest side quest box in the gap below each Main_Node. */
          const firstTop = new Map<string, number>()

          for (const side of sides) {
            const p = layout.nodes[side.id]
            expect(p, `${viewport}: no placement for ${side.id}`).toBeDefined()
            if (!p) continue
            expect(p.cx).toBe(cfg.sideX)

            // The Main_Node directly above the side quest, and the one after it.
            let aboveIndex = -1
            layout.mainOrder.forEach((id, i) => {
              const m = layout.nodes[id]
              if (m && m.cy < p.cy) aboveIndex = i
            })
            const aboveId = layout.mainOrder[aboveIndex]
            const above = aboveId === undefined ? undefined : layout.nodes[aboveId]
            expect(above, `${viewport}: side quest ${side.id} is above every Main_Node`).toBeDefined()
            if (!above || aboveId === undefined) continue
            const nextId = layout.mainOrder[aboveIndex + 1]
            const next = nextId === undefined ? undefined : layout.nodes[nextId]

            const top = p.cy - p.size / 2
            const bottom = p.cy + p.size / 2 + cfg.sideLabelReserve
            expect(top, `${viewport}: ${side.id} reaches into the label of ${aboveId}`).toBeGreaterThanOrEqual(above.cy + cfg.mainLabelReach)
            if (next) expect(bottom, `${viewport}: ${side.id} reaches into the label of ${nextId}`).toBeLessThanOrEqual(next.cy - cfg.mainLabelReach)
            firstTop.set(aboveId, Math.min(firstTop.get(aboveId) ?? Number.POSITIVE_INFINITY, top))

            // It hangs from the latest Main_Node among its prerequisites, or from a later one via a side quest.
            for (const prerequisiteId of side.prerequisites) {
              const i = mainPosition.get(prerequisiteId)
              if (i !== undefined) expect(aboveIndex).toBeGreaterThanOrEqual(i)
            }
          }

          // The first side quest below a Main_Node starts right at the end of that Main_Node's label reach.
          for (const [mainId, top] of firstTop) {
            const m = layout.nodes[mainId]
            if (m) expect(top, `${viewport}: gap above the first side quest of ${mainId}`).toBe(m.cy + cfg.mainLabelReach)
          }
        }
      }),
      RUNS,
    )
  }, TIMEOUT_MS)
})

// ---------------------------------------------------------------------------
// Property 18
// ---------------------------------------------------------------------------

describe('Property 18: Every node is placed below its prerequisites', () => {
  // Feature: skill-path-ui, Property 18: Every node is placed below its prerequisites
  // **Validates: Requirements 5.8**
  it('places each Node exactly once and strictly below every prerequisite', async () => {
    await fc.assert(
      fc.asyncProperty(arbPathTree, async (tree) => {
        const nodes = allNodes(tree)
        const ids = [...new Set(nodes.map(node => node.id))].sort()
        for (const viewport of VIEWPORTS) {
          const layout = await layoutOk(tree, viewport)

          expect(Object.keys(layout.nodes).sort()).toEqual(ids)

          for (const node of nodes) {
            const p = layout.nodes[node.id]
            expect(p, `${viewport}: no placement for ${node.id}`).toBeDefined()
            if (!p) continue
            expect(p.id).toBe(node.id)
            for (const prerequisiteId of node.prerequisites) {
              const q = layout.nodes[prerequisiteId]
              expect(q, `${viewport}: no placement for prerequisite ${prerequisiteId}`).toBeDefined()
              if (!q) continue
              expect(p.cy, `${viewport}: ${node.id} not below ${prerequisiteId}`).toBeGreaterThan(q.cy)
            }
          }
        }
      }),
      RUNS,
    )
  }, TIMEOUT_MS)
})

// ---------------------------------------------------------------------------
// Property 19
// ---------------------------------------------------------------------------

interface Box { left: number; right: number; top: number; bottom: number }

/** Square of side `size` centered at (cx, cy). */
function boxOf(p: { cx: number; cy: number; size: number }): Box {
  const half = p.size / 2
  return { left: p.cx - half, right: p.cx + half, top: p.cy - half, bottom: p.cy + half }
}

/** Strict 2D overlap: touching edges do not count. */
function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

describe('Property 19: Nothing overlaps', () => {
  // Feature: skill-path-ui, Property 19: Nothing overlaps
  // **Validates: Requirements 5.7, 5.9**
  it('keeps Node boxes, side quest labels and Main_Node labels apart from each other and from full-width header bands, one band per Section in order', async () => {
    await fc.assert(
      fc.asyncProperty(arbPathTree, async (tree) => {
        for (const viewport of VIEWPORTS) {
          const cfg = LAYOUT_CONFIG[viewport]
          const layout = await layoutOk(tree, viewport)
          const placements = Object.values(layout.nodes)
          const boxes = placements.map(p => ({ id: p.id, box: boxOf(p) }))

          expect(layout.headers.map(h => h.sectionIndex)).toEqual(tree.sections.map((_, i) => i))
          const bands: Band[] = layout.headers.map(h => ({ top: h.top, bottom: h.top + h.height }))

          for (let i = 0; i < boxes.length; i++) {
            const a = boxes[i]
            if (!a) continue
            for (let j = i + 1; j < boxes.length; j++) {
              const b = boxes[j]
              if (!b) continue
              expect(boxesOverlap(a.box, b.box), `${viewport}: ${a.id} overlaps ${b.id}`).toBe(false)
            }
            bands.forEach((band, k) => {
              expect(overlaps(a.box, band), `${viewport}: ${a.id} overlaps header ${k}`).toBe(false)
            })
          }

          // Labels (APP-PATH-02). A side quest's footprint is its box plus the label below it;
          // a Main_Node's label band is `mainLabelReach` above and below its center. Label
          // widths depend on the column, so the bands are compared at any x.
          const sideFootprints = placements.filter(p => p.kind === 'side').map(p => ({
            id: p.id,
            band: { top: p.cy - p.size / 2, bottom: p.cy + p.size / 2 + cfg.sideLabelReserve },
          }))
          const mainLabels = placements.filter(p => p.kind !== 'side').map(p => ({
            id: p.id,
            band: { top: p.cy - cfg.mainLabelReach, bottom: p.cy + cfg.mainLabelReach },
          }))
          sideFootprints.forEach((a, i) => {
            for (const b of sideFootprints.slice(i + 1)) {
              expect(overlaps(a.band, b.band), `${viewport}: side quest ${a.id} and its label overlap ${b.id}`).toBe(false)
            }
            for (const m of mainLabels) {
              expect(overlaps(a.band, m.band), `${viewport}: side quest ${a.id} and its label overlap the label of ${m.id}`).toBe(false)
            }
            bands.forEach((band, k) => {
              expect(overlaps(a.band, band), `${viewport}: side quest ${a.id} and its label overlap header ${k}`).toBe(false)
            })
          })
        }
      }),
      RUNS,
    )
  }, TIMEOUT_MS)
})
// ---------------------------------------------------------------------------
// Property 20
// ---------------------------------------------------------------------------
describe('Property 20: Layout is deterministic', () => {
  // Feature: skill-path-ui, Property 20: Layout is deterministic
  // **Validates: Requirements 5.10**
  it('returns deeply equal layouts for repeated runs, a fresh ELK instance and a cloned tree', async () => {
    /** Same as `layoutOk`, but with a caller-chosen ELK instance. */
    async function layoutWith(tree: SkillTree, viewport: ViewportClass, instance: ELK): Promise<PathLayout> {
      const result = await computePathLayout(tree, viewport, instance)
      if (!result.ok) throw new Error(`layout failed (${viewport}): ${JSON.stringify(result.errors)}`)
      return result.value
    }
    await fc.assert(
      fc.asyncProperty(arbPathTree, async (tree) => {
        const snapshot = structuredClone(tree)
        for (const viewport of VIEWPORTS) {
          const first = await layoutOk(tree, viewport)
          const second = await layoutOk(tree, viewport)
          expect(second, `${viewport}: second run differs`).toEqual(first)
          const fresh = await layoutWith(tree, viewport, new ELK())
          expect(fresh, `${viewport}: fresh ELK instance differs`).toEqual(first)
          const cloned = await layoutOk(structuredClone(tree), viewport)
          expect(cloned, `${viewport}: cloned tree differs`).toEqual(first)
        }
        // Layout must not mutate its input.
        expect(tree).toEqual(snapshot)
      }),
      RUNS,
    )
  }, TIMEOUT_MS)
})

// ---------------------------------------------------------------------------
// Property 21
// ---------------------------------------------------------------------------

describe('Property 21: Trail segments match prerequisite links', () => {
  // Feature: skill-path-ui, Property 21: Trail segments match prerequisite links
  // **Validates: Requirements 6.1, 6.2, 6.3**
  it('draws one 3-dot segment per prerequisite link, toned done only when both ends are completed', async () => {
    const arbTreeAndProgress = arbPathTree.chain(tree => fc.tuple(fc.constant(tree), arbProgress(tree)))
    const DOT_DIAMETER: Readonly<Record<ViewportClass, number>> = { mobile: 8, desktop: 10 }
    const key = (fromId: string, toId: string): string => JSON.stringify([fromId, toId])

    await fc.assert(
      fc.asyncProperty(arbTreeAndProgress, async ([tree, progress]) => {
        // Distinct (prerequisite, dependent) pairs, first occurrence per Node id.
        const seen = new Set<string>()
        const expected: string[] = []
        for (const node of allNodes(tree)) {
          if (seen.has(node.id)) continue
          seen.add(node.id)
          for (const prerequisiteId of new Set(node.prerequisites)) expected.push(key(prerequisiteId, node.id))
        }
        expected.sort()

        const states = deriveNodeStates(tree, progress)

        for (const viewport of VIEWPORTS) {
          const layout = await layoutOk(tree, viewport)

          expect(layout.dotDiameter).toBe(DOT_DIAMETER[viewport])
          expect(layout.segments.map(s => key(s.fromId, s.toId)).sort(), `${viewport}: segment pairs`).toEqual(expected)

          for (const seg of layout.segments) {
            const a = layout.nodes[seg.fromId]
            const b = layout.nodes[seg.toId]
            expect(a, `${viewport}: no placement for ${seg.fromId}`).toBeDefined()
            expect(b, `${viewport}: no placement for ${seg.toId}`).toBeDefined()
            if (!a || !b) continue

            const upper = a.cy <= b.cy ? a : b
            const lower = a.cy <= b.cy ? b : a
            const crosses = layout.headers.some(h =>
              h.top < lower.cy - lower.size / 2 && upper.cy + upper.size / 2 < h.top + h.height)
            if (crosses) {
              expect(seg.dots, `${viewport}: dots across a header band`).toHaveLength(0)
            }
            else {
              expect(seg.dots).toHaveLength(3)
              ;[0.28, 0.5, 0.72].forEach((t, i) => {
                const dot = seg.dots[i]!
                const start = trailStart(a, b)
                expect(dot.x).toBeCloseTo(start.x + (b.cx - start.x) * t)
                expect(dot.y).toBeCloseTo(start.y + (b.cy - start.y) * t)
              })
            }

            const bothDone = states.get(seg.fromId) === 'completed' && states.get(seg.toId) === 'completed'
            expect(segmentTone(states, seg)).toBe(bothDone ? 'done' : 'trail')
          }
        }
      }),
      RUNS,
    )
  }, TIMEOUT_MS)
})
