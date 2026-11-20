/**
 * Path_Layout: maps a Skill_Tree onto the winding trail.
 *
 * elkjs computes a layered top-to-bottom ordering; fixed per-viewport
 * constants (`LAYOUT_CONFIG`) turn that ordering into positions.
 * Explicit imports only, so vitest loads this file without Nuxt.
 */
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api'
import type { SkillNode, SkillTree } from '#shared/types/skill-tree'
import type { Result } from '#shared/types/validation'
import type { ViewportClass } from '#shared/types/viewport'
import { findPathOrderViolation } from '#shared/utils/path-order'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A point in path coordinates: x relative to the center line, y from the top of the path area. */
export interface Point { x: number; y: number }

export type NodeKind = 'main' | 'milestone' | 'side'

export interface NodePlacement { id: string; kind: NodeKind; cx: number; cy: number; size: number }

export interface HeaderPlacement { sectionIndex: number; top: number; height: number }

/** `dots` is empty when the segment crosses a Section_Header band. */
export interface TrailSegment { fromId: string; toId: string; dots: Point[] }

export interface PathLayout {
  viewport: ViewportClass
  nodes: Record<string, NodePlacement>
  mainOrder: string[]
  headers: HeaderPlacement[]
  segments: TrailSegment[]
  height: number
  dotDiameter: number
  ringPad: number
}

export type LayoutError =
  | { kind: 'unsupported_order'; nodeId: string; prerequisiteId: string }
  | { kind: 'layout_failed'; message: string }

/** The part of the elkjs API the layout needs, so a worker build can be injected later. */
export interface ElkLike { layout(graph: ElkNode): Promise<ElkNode> }

/** Fixed layout constants for one viewport class (all px). */
export interface LayoutConfig {
  /** Main_Node center offsets from the center line, indexed by `i % 4` (Req 5.2). */
  windingOffsets: readonly [number, number, number, number]
  /** Vertical distance between consecutive Main_Node centers in a Section when no Side_Quest_Node sits between them (Req 5.4). */
  rowGap: number
  /** Side_Quest_Node center offset from the center line (Req 5.5). */
  sideX: number
  /** Square bounding box sides per Node kind (Req 5.6). */
  size: Readonly<Record<NodeKind, number>>
  /** Fixed Section_Header band height. */
  headerHeight: number
  /** Top of the first Section_Header band. */
  headerTop: number
  /** Header band bottom to first Main_Node center. */
  sectionLead: number
  /** Last Main_Node center to next header band top. */
  sectionTail: number
  /**
   * Space reserved below a Side_Quest_Node box for its label: the gap, a
   * title of two lines and the status line. `PathNodeLabel` clamps the title
   * to two lines, so the label is never taller.
   */
  sideLabelReserve: number
  /**
   * How far a Main_Node label reaches above and below the Main_Node center:
   * half of a three-line title plus the status line (the title is clamped to
   * three lines), rounded up. Side quests stay outside this reach (Req 5.5).
   */
  mainLabelReach: number
  /** Minimum vertical space between Side_Quest_Node footprints. */
  sideGap: number
  /** Space below the lowest footprint. */
  bottomPadding: number
  /** Trail dot diameter (Req 6.1). */
  dotDiameter: number
  /** Gap between a Node box and its Progress_Ring. */
  ringPad: number
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const LAYOUT_CONFIG: Readonly<Record<ViewportClass, LayoutConfig>> = {
  mobile: {
    windingOffsets: [0, -60, -90, -60],
    rowGap: 112,
    sideX: 110,
    size: { main: 72, milestone: 84, side: 64 },
    headerHeight: 104,
    headerTop: 16,
    sectionLead: 92,
    sectionTail: 76,
    sideLabelReserve: 64,
    mainLabelReach: 40,
    sideGap: 12,
    bottomPadding: 120,
    dotDiameter: 8,
    ringPad: 9,
  },
  desktop: {
    windingOffsets: [0, -90, -135, -90],
    rowGap: 124,
    sideX: 170,
    size: { main: 80, milestone: 92, side: 70 },
    headerHeight: 120,
    headerTop: 8,
    sectionLead: 104,
    sectionTail: 84,
    sideLabelReserve: 72,
    mainLabelReach: 42,
    sideGap: 12,
    bottomPadding: 64,
    dotDiameter: 10,
    ringPad: 10,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Placement kind of a Node. An optional milestone is placed as a side quest. */
export function nodeKind(node: SkillNode): NodeKind {
  if (node.optional) return 'side'
  return node.milestone ? 'milestone' : 'main'
}

/** Every Node in document order (Section order, then Node order), first occurrence per id. */
function uniqueNodes(tree: SkillTree): SkillNode[] {
  const seen = new Set<string>()
  const nodes: SkillNode[] = []
  for (const section of tree.sections) {
    for (const node of section.nodes) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      nodes.push(node)
    }
  }
  return nodes
}

// ---------------------------------------------------------------------------
// Path order precondition
// ---------------------------------------------------------------------------

/**
 * Checks the layout-only precondition (design "Path order precondition"):
 * - P1: every prerequisite of a Main_Node is an earlier Main_Node, or a
 *   Side_Quest_Node that is drawn above it.
 * - P2: every prerequisite of a Side_Quest_Node is a Node of the tree; it may
 *   come later in document order.
 * Returns the first offending (node, prerequisite) pair in document order, or null.
 */
export function checkPathOrder(tree: SkillTree): LayoutError | null {
  const violation = findPathOrderViolation(tree)
  return violation ? { kind: 'unsupported_order', ...violation } : null
}

// ---------------------------------------------------------------------------
// ELK graph
// ---------------------------------------------------------------------------

export const ELK_LAYOUT_OPTIONS: Readonly<Record<string, string>> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.randomSeed': '1',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
}

/**
 * Builds the elkjs input graph: one child per unique id (document order, square
 * boxes from `cfg.size`), a `prerequisite → node` edge per prerequisite link,
 * then trail edges between consecutive Main_Nodes in document order.
 * Prerequisites that name no Node are skipped; `checkPathOrder` reports them.
 */
export function buildElkGraph(tree: SkillTree, cfg: LayoutConfig): ElkNode {
  const nodes = uniqueNodes(tree)
  const ids = new Set(nodes.map(node => node.id))

  const children: ElkNode[] = nodes.map((node) => {
    const side = cfg.size[nodeKind(node)]
    return { id: node.id, width: side, height: side }
  })

  const edges: ElkExtendedEdge[] = []
  for (const node of nodes) {
    const seen = new Set<string>()
    for (const prerequisiteId of node.prerequisites) {
      if (!ids.has(prerequisiteId) || seen.has(prerequisiteId)) continue
      seen.add(prerequisiteId)
      edges.push({ id: `prereq:${prerequisiteId}->${node.id}`, sources: [prerequisiteId], targets: [node.id] })
    }
  }

  const mains = nodes.filter(node => !node.optional)
  for (let i = 0; i + 1 < mains.length; i++) {
    const from = mains[i]
    const to = mains[i + 1]
    if (!from || !to) continue
    edges.push({ id: `trail:${from.id}->${to.id}`, sources: [from.id], targets: [to.id] })
  }

  return { id: 'root', layoutOptions: { ...ELK_LAYOUT_OPTIONS }, children, edges }
}

// ---------------------------------------------------------------------------
// Trail dots
// ---------------------------------------------------------------------------

/** The 3 dots of a Trail_Segment at 28%, 50% and 72% from `a` to `b` (Req 6.1). */
export function trailDots(a: Point, b: Point): [Point, Point, Point] {
  const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  return [at(0.28), at(0.5), at(0.72)]
}

/**
 * Where a Trail_Segment starts. The branch from a Main_Node to a
 * Side_Quest_Node starts at the Main_Node's lower edge, so its dots run below
 * the Main_Node's label instead of through it. The way back from a
 * Side_Quest_Node to a Main_Node that needs it starts at the side quest's left
 * edge, beside its label. Every other segment starts at the center.
 */
export function trailStart(a: NodePlacement, b: NodePlacement): Point {
  if (a.kind !== 'side' && b.kind === 'side') return { x: a.cx, y: a.cy + a.size / 2 }
  if (a.kind === 'side' && b.kind !== 'side') return { x: a.cx - a.size / 2, y: a.cy }
  return { x: a.cx, y: a.cy }
}

/**
 * Trail dots for a segment, or none when the segment crosses a Section_Header
 * band: the header separates the Sections, so dots there would sit on its text.
 */
export function bandAwareTrailDots(
  a: NodePlacement,
  b: NodePlacement,
  bands: readonly Interval[],
): Point[] {
  const [upper, lower] = a.cy <= b.cy ? [a, b] : [b, a]
  const lo = upper.cy + upper.size / 2
  const hi = lower.cy - lower.size / 2
  if (bands.some(band => band.top < hi && lo < band.bottom)) return []
  return trailDots(trailStart(a, b), { x: b.cx, y: b.cy })
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export interface Interval { top: number; bottom: number }

function layoutFailed(message: string): Result<PathLayout, LayoutError> {
  return { ok: false, errors: { kind: 'layout_failed', message } }
}

/** Vertical footprint of a placed Node: its box, plus the label reserve below a side quest. */
function footprint(p: NodePlacement, cfg: LayoutConfig): Interval {
  const reserve = p.kind === 'side' ? cfg.sideLabelReserve : 0
  return { top: p.cy - p.size / 2, bottom: p.cy + p.size / 2 + reserve }
}

/** Height of `count` stacked Side_Quest_Node footprints with `sideGap` between them. */
function sideStackHeight(count: number, cfg: LayoutConfig): number {
  return count * (cfg.size.side + cfg.sideLabelReserve) + (count - 1) * cfg.sideGap
}

/**
 * Maps the elkjs result onto the winding trail (design "placePath" steps 1–6).
 * Takes `viewport` instead of a bare config because `PathLayout` records it;
 * `cfg` defaults to `LAYOUT_CONFIG[viewport]` and can be overridden in tests.
 */
export function placePath(
  tree: SkillTree,
  elkResult: ElkNode,
  viewport: ViewportClass,
  cfg: LayoutConfig = LAYOUT_CONFIG[viewport],
): Result<PathLayout, LayoutError> {
  const nodes = uniqueNodes(tree)
  const docIndex = new Map(nodes.map((node, i) => [node.id, i]))

  // Step 1: elkjs y per id, completeness and Main_Node order check.
  const elkY = new Map<string, number>()
  for (const child of elkResult.children ?? []) {
    if (typeof child.y === 'number' && Number.isFinite(child.y)) elkY.set(child.id, child.y)
  }
  const missing = nodes.find(node => !elkY.has(node.id))
  if (missing) return layoutFailed(`elkjs returned no position for node "${missing.id}"`)

  const byElkOrder = (a: SkillNode, b: SkillNode): number =>
    (elkY.get(a.id) ?? 0) - (elkY.get(b.id) ?? 0) || (docIndex.get(a.id) ?? 0) - (docIndex.get(b.id) ?? 0)

  const mains = nodes.filter(node => !node.optional)
  const mainOrder = mains.map(node => node.id)
  const sortedMains = [...mains].sort(byElkOrder)
  if (sortedMains.some((node, i) => node.id !== mainOrder[i])) {
    return layoutFailed('elkjs ordered the main path differently from the document order')
  }

  // Step 2: the Main_Node each Side_Quest_Node hangs from, in elkjs
  // (topological) order: the latest Main_Node among its prerequisites, where
  // a Side_Quest_Node prerequisite counts as the Main_Node it hangs from.
  const mainPosition = new Map(mainOrder.map((id, i) => [id, i]))
  const sectionIndexOf = new Map<string, number>()
  tree.sections.forEach((section, sectionIndex) => {
    for (const node of section.nodes) if (!sectionIndexOf.has(node.id)) sectionIndexOf.set(node.id, sectionIndex)
  })
  const sides = nodes.filter(node => node.optional).sort(byElkOrder)
  const anchorOf = new Map<string, string | null>()
  const sidesAfterMain = new Map<string, number>()
  const looseSidesInSection = new Map<number, number>()
  for (const side of sides) {
    let anchorId: string | null = null
    for (const prerequisiteId of side.prerequisites) {
      let candidate: string | null
      if (mainPosition.has(prerequisiteId)) {
        candidate = prerequisiteId
      }
      else {
        const viaSide = anchorOf.get(prerequisiteId)
        if (viaSide === undefined) {
          if (docIndex.has(prerequisiteId)) {
            return layoutFailed(`elkjs placed side quest "${side.id}" before its prerequisite "${prerequisiteId}"`)
          }
          continue
        }
        candidate = viaSide
      }
      if (candidate === null) continue
      if (anchorId === null || (mainPosition.get(candidate) ?? 0) > (mainPosition.get(anchorId) ?? 0)) anchorId = candidate
    }
    anchorOf.set(side.id, anchorId)
    if (anchorId === null) {
      const sectionIndex = sectionIndexOf.get(side.id) ?? 0
      looseSidesInSection.set(sectionIndex, (looseSidesInSection.get(sectionIndex) ?? 0) + 1)
    }
    else {
      sidesAfterMain.set(anchorId, (sidesAfterMain.get(anchorId) ?? 0) + 1)
    }
  }

  // Step 3: header bands and Main_Nodes, Section by Section. A Main_Node with
  // side quests gets a taller gap below it, so the side quests and their
  // labels fit between its label and the next Main_Node's label.
  const placements: Record<string, NodePlacement> = {}
  const headers: HeaderPlacement[] = []
  const bandBottoms: number[] = []
  const seen = new Set<string>()
  let cursor = cfg.headerTop
  let mainIndex = 0
  tree.sections.forEach((section, sectionIndex) => {
    const top = cursor
    const bandBottom = top + cfg.headerHeight
    headers.push({ sectionIndex, top, height: cfg.headerHeight })
    bandBottoms.push(bandBottom)
    const loose = looseSidesInSection.get(sectionIndex) ?? 0
    const looseBottom = loose > 0 ? bandBottom + cfg.sideGap + sideStackHeight(loose, cfg) : bandBottom
    let center = Math.max(bandBottom + cfg.sectionLead, loose > 0 ? looseBottom + cfg.mainLabelReach : 0)
    let last: { center: number; sides: number } | null = null
    for (const node of section.nodes) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      if (node.optional) continue
      const kind = nodeKind(node)
      const offset = cfg.windingOffsets[mainIndex % 4] ?? 0
      placements[node.id] = { id: node.id, kind, cx: offset, cy: center, size: cfg.size[kind] }
      const count = sidesAfterMain.get(node.id) ?? 0
      last = { center, sides: count }
      center += count > 0
        ? Math.max(cfg.rowGap, 2 * cfg.mainLabelReach + sideStackHeight(count, cfg))
        : cfg.rowGap
      mainIndex++
    }
    if (last === null) {
      cursor = loose > 0 ? looseBottom + cfg.sideGap : bandBottom
    }
    else {
      const tail = last.sides > 0 ? cfg.mainLabelReach + sideStackHeight(last.sides, cfg) + cfg.sideGap : 0
      cursor = last.center + Math.max(cfg.sectionTail, tail)
    }
  })

  // Step 4: Side_Quest_Nodes in elkjs order, each at the top of the space
  // reserved for it, then pushed below whatever is already there.
  const occupied: Interval[] = headers.map(h => ({ top: h.top, bottom: h.top + h.height }))
  for (const side of sides) {
    const size = cfg.size.side
    const anchorId = anchorOf.get(side.id) ?? null
    const anchor = anchorId === null ? undefined : placements[anchorId]
    const desired = anchor
      ? anchor.cy + cfg.mainLabelReach + size / 2
      : (bandBottoms[sectionIndexOf.get(side.id) ?? 0] ?? cfg.headerTop + cfg.headerHeight) + cfg.sideGap + size / 2

    const placement: NodePlacement = { id: side.id, kind: 'side', cx: cfg.sideX, cy: desired, size }
    const sorted = [...occupied].sort((a, b) => a.top - b.top || a.bottom - b.bottom)
    let moved = true
    while (moved) {
      moved = false
      for (const interval of sorted) {
        const f = footprint(placement, cfg)
        if (f.top < interval.bottom && interval.top < f.bottom) {
          placement.cy = interval.bottom + size / 2
          moved = true
        }
      }
    }
    placements[side.id] = placement
    const f = footprint(placement, cfg)
    occupied.push({ top: f.top - cfg.sideGap, bottom: f.bottom + cfg.sideGap })
  }

  // Step 5: total height.
  let lowest = 0
  for (const h of headers) lowest = Math.max(lowest, h.top + h.height)
  for (const p of Object.values(placements)) lowest = Math.max(lowest, footprint(p, cfg).bottom)
  const height = lowest + cfg.bottomPadding

  // Step 6: one Trail_Segment per (prerequisite, dependent) pair.
  const segments: TrailSegment[] = []
  const bands: Interval[] = headers.map(h => ({ top: h.top, bottom: h.top + h.height }))
  for (const node of nodes) {
    const to = placements[node.id]
    if (!to) return layoutFailed(`no position for node "${node.id}"`)
    const linked = new Set<string>()
    for (const prerequisiteId of node.prerequisites) {
      const from = placements[prerequisiteId]
      if (!from || linked.has(prerequisiteId)) continue
      linked.add(prerequisiteId)
      segments.push({
        fromId: from.id,
        toId: to.id,
        dots: bandAwareTrailDots(from, to, bands),
      })
    }
  }

  return {
    ok: true,
    value: {
      viewport,
      nodes: placements,
      mainOrder,
      headers,
      segments,
      height,
      dotDiameter: cfg.dotDiameter,
      ringPad: cfg.ringPad,
    },
  }
}

/**
 * Full Path_Layout: path order check, elkjs ordering, then placement.
 * Any throw (elkjs import, `layout()`, placement) becomes `layout_failed` (Req 5.12).
 */
export async function computePathLayout(
  tree: SkillTree,
  viewport: ViewportClass,
  elk: ElkLike,
): Promise<Result<PathLayout, LayoutError>> {
  const orderError = checkPathOrder(tree)
  if (orderError) return { ok: false, errors: orderError }
  try {
    const cfg = LAYOUT_CONFIG[viewport]
    const result = await elk.layout(buildElkGraph(tree, cfg))
    return placePath(tree, result, viewport, cfg)
  }
  catch (error) {
    return layoutFailed(error instanceof Error ? error.message : String(error))
  }
}
