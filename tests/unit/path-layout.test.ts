import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import type { SkillNode, SkillTree } from '#shared/types/skill-tree'
import type { ElkNode } from 'elkjs/lib/elk-api'
import { bandAwareTrailDots, buildElkGraph, checkPathOrder, computePathLayout, LAYOUT_CONFIG, placePath, trailDots, trailStart } from '~/utils/path-layout'
import { loadSkillTree } from '#shared/utils/skill-tree-load'

function node(id: string, prerequisites: string[] = [], flags: Partial<Pick<SkillNode, 'optional' | 'milestone'>> = {}): SkillNode {
  return {
    id,
    title: id,
    description: `${id} description`,
    prerequisites,
    optional: flags.optional ?? false,
    milestone: flags.milestone ?? false,
    quests: ['q1', 'q2', 'q3'],
  }
}

function tree(...sections: SkillNode[][]): SkillTree {
  return {
    hobby: 'bouldering',
    sections: sections.map((nodes, i) => ({ title: `S${i + 1}`, level: 'beginner', nodes })),
    mascot: { set: 'bouldering' },
  }
}

const small = tree(
  [node('a'), node('b', ['a']), node('side', ['b'], { optional: true }), node('c', ['b'])],
  [node('m', ['c'], { milestone: true })],
)

describe('LAYOUT_CONFIG', () => {
  it('holds the design values for both viewports', () => {
    expect(LAYOUT_CONFIG.mobile).toEqual({
      windingOffsets: [0, -60, -90, -60], rowGap: 112, sideX: 110,
      size: { main: 72, milestone: 84, side: 64 },
      headerHeight: 104, headerTop: 16, sectionLead: 92, sectionTail: 76,
      sideLabelReserve: 64, mainLabelReach: 40, sideGap: 12, bottomPadding: 120, dotDiameter: 8, ringPad: 9,
    })
    expect(LAYOUT_CONFIG.desktop).toEqual({
      windingOffsets: [0, -90, -135, -90], rowGap: 124, sideX: 170,
      size: { main: 80, milestone: 92, side: 70 },
      headerHeight: 120, headerTop: 8, sectionLead: 104, sectionTail: 84,
      sideLabelReserve: 72, mainLabelReach: 42, sideGap: 12, bottomPadding: 64, dotDiameter: 10, ringPad: 10,
    })
  })
})

describe('checkPathOrder', () => {
  it('accepts trees that satisfy P1 and P2', () => {
    expect(checkPathOrder(small)).toBeNull()
  })

  it('rejects a Main_Node depending on a later Node (P1)', () => {
    const t = tree([node('a', ['b']), node('b')])
    expect(checkPathOrder(t)).toEqual({ kind: 'unsupported_order', nodeId: 'a', prerequisiteId: 'b' })
  })

  it('rejects a Main_Node depending on a Side_Quest_Node (P1)', () => {
    const t = tree([node('a'), node('s', ['a'], { optional: true }), node('b', ['s'])])
    expect(checkPathOrder(t)).toEqual({ kind: 'unsupported_order', nodeId: 'b', prerequisiteId: 's' })
  })

  it('rejects a Side_Quest_Node depending on a later Node (P2)', () => {
    const t = tree([node('a'), node('s', ['b'], { optional: true })], [node('b', ['a'])])
    expect(checkPathOrder(t)).toEqual({ kind: 'unsupported_order', nodeId: 's', prerequisiteId: 'b' })
  })

  it('lets a Side_Quest_Node depend on an earlier Side_Quest_Node (P2)', () => {
    const t = tree([node('a'), node('s1', ['a'], { optional: true }), node('s2', ['s1'], { optional: true })])
    expect(checkPathOrder(t)).toBeNull()
  })
})

describe('buildElkGraph', () => {
  it('emits children, prerequisite edges and trail edges in document order', () => {
    const graph = buildElkGraph(small, LAYOUT_CONFIG.mobile)
    expect(graph.layoutOptions).toEqual({
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.randomSeed': '1',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
    })
    expect(graph.children).toEqual([
      { id: 'a', width: 72, height: 72 },
      { id: 'b', width: 72, height: 72 },
      { id: 'side', width: 64, height: 64 },
      { id: 'c', width: 72, height: 72 },
      { id: 'm', width: 84, height: 84 },
    ])
    expect(graph.edges?.map(e => [e.sources[0], e.targets[0]])).toEqual([
      ['a', 'b'], ['b', 'side'], ['b', 'c'], ['c', 'm'],
      ['a', 'b'], ['b', 'c'], ['c', 'm'],
    ])
    const edgeIds = graph.edges?.map(e => e.id) ?? []
    expect(new Set(edgeIds).size).toBe(edgeIds.length)
  })

  it('uses desktop sizes and is accepted by elkjs', async () => {
    const graph = buildElkGraph(small, LAYOUT_CONFIG.desktop)
    expect(graph.children?.map(c => c.width)).toEqual([80, 80, 70, 80, 92])
    const result = await new ELK().layout(graph)
    const y = new Map(result.children?.map(c => [c.id, c.y ?? Number.NaN]))
    const ya = y.get('a') ?? Number.NaN
    const yb = y.get('b') ?? Number.NaN
    const yc = y.get('c') ?? Number.NaN
    const ym = y.get('m') ?? Number.NaN
    expect(ya).toBeLessThan(yb)
    expect(yb).toBeLessThan(yc)
    expect(yc).toBeLessThan(ym)
  })
})

describe('trailDots', () => {
  it('places dots at 28%, 50% and 72% of the line', () => {
    const [d1, d2, d3] = trailDots({ x: 0, y: 0 }, { x: -100, y: 200 })
    expect(d1.x).toBeCloseTo(-28)
    expect(d1.y).toBeCloseTo(56)
    expect(d2).toEqual({ x: -50, y: 100 })
    expect(d3.x).toBeCloseTo(-72)
    expect(d3.y).toBeCloseTo(144)
  })
})

describe('placePath', () => {
  /** A fake elkjs result with y = document position, enough for placePath. */
  function elkInDocOrder(t: SkillTree): ElkNode {
    const ids = [...new Set(t.sections.flatMap(s => s.nodes.map(n => n.id)))]
    return { id: 'root', children: ids.map((id, i) => ({ id, x: 0, y: i * 100, width: 1, height: 1 })) }
  }

  it('places headers, winding Main_Nodes, side quests and segments (mobile)', () => {
    const result = placePath(small, elkInDocOrder(small), 'mobile')
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    const l = result.value
    expect(l.viewport).toBe('mobile')
    expect(l.mainOrder).toEqual(['a', 'b', 'c', 'm'])
    expect(l.headers).toEqual([
      { sectionIndex: 0, top: 16, height: 104 },
      { sectionIndex: 1, top: 608, height: 104 },
    ])
    expect(l.nodes).toEqual({
      a: { id: 'a', kind: 'main', cx: 0, cy: 212, size: 72 },
      b: { id: 'b', kind: 'main', cx: -60, cy: 324, size: 72 },
      // b has a side quest: the gap to c is 40 + (64 + 64) + 40 = 208, not rowGap 112.
      c: { id: 'c', kind: 'main', cx: -90, cy: 532, size: 72 },
      // Top of the side quest box at b + mainLabelReach 40.
      side: { id: 'side', kind: 'side', cx: 110, cy: 396, size: 64 },
      m: { id: 'm', kind: 'milestone', cx: -60, cy: 804, size: 84 },
    })
    expect(l.height).toBe(846 + 120)
    expect(l.segments.map(s => [s.fromId, s.toId])).toEqual([['a', 'b'], ['b', 'side'], ['b', 'c'], ['c', 'm']])
    expect(l.segments[0]?.dots).toEqual(trailDots({ x: 0, y: 212 }, { x: -60, y: 324 }))
    // The branch to the side quest starts at b's lower edge, below b's label.
    expect(l.segments[1]?.dots).toEqual(trailDots({ x: -60, y: 324 + 36 }, { x: 110, y: 396 }))
    expect(l.dotDiameter).toBe(8)
    expect(l.ringPad).toBe(9)
  })

  it('stacks the side quests of a Section\'s last Main_Node above the next header', () => {
    const t = tree(
      [node('a'), node('s1', ['a'], { optional: true }), node('s2', ['a'], { optional: true })],
      [node('b', ['a'])],
    )
    const result = placePath(t, elkInDocOrder(t), 'mobile')
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    const { nodes, headers } = result.value
    // s1 box top at a + mainLabelReach: 212 + 40 + 32.
    expect(nodes.s1?.cy).toBe(284)
    // s2 below the s1 footprint (284 + 32 + 64) + sideGap 12.
    expect(nodes.s2?.cy).toBe(380 + 12 + 32)
    // Header 2 starts sideGap below the s2 footprint (424 + 32 + 64), not at a + sectionTail.
    expect(headers[1]).toEqual({ sectionIndex: 1, top: 532, height: 104 })
    expect(nodes.b?.cy).toBe(532 + 104 + 92)
  })

  it('keeps a side quest and its label clear of the Main_Node labels above and below (APP-PATH-02)', () => {
    for (const viewport of ['mobile', 'desktop'] as const) {
      const cfg = LAYOUT_CONFIG[viewport]
      const result = placePath(small, elkInDocOrder(small), viewport)
      if (!result.ok) throw new Error(JSON.stringify(result.errors))
      const { b, c, side } = result.value.nodes
      if (!b || !c || !side) throw new Error('missing nodes')
      expect(side.cy - side.size / 2).toBeGreaterThanOrEqual(b.cy + cfg.mainLabelReach)
      expect(side.cy + side.size / 2 + cfg.sideLabelReserve).toBeLessThanOrEqual(c.cy - cfg.mainLabelReach)
    }
  })

  it('puts a side quest that depends on a side quest in the same gap, below it', () => {
    const t = tree([
      node('a'),
      node('s1', ['a'], { optional: true }),
      node('s2', ['s1'], { optional: true }),
      node('b', ['a']),
    ])
    const result = placePath(t, elkInDocOrder(t), 'desktop')
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    const { a, b, s1, s2 } = result.value.nodes
    if (!a || !b || !s1 || !s2) throw new Error('missing nodes')
    expect(s1.cy).toBe(a.cy + 42 + 35)
    expect(s2.cy).toBe(s1.cy + 35 + 72 + 12 + 35)
    expect(b.cy - a.cy).toBe(42 + 2 * (70 + 72) + 12 + 42)
  })

  it('leaves a path without side quests on the fixed row gap', () => {
    const t = tree([node('a'), node('b', ['a']), node('c', ['b'])], [node('d', ['c'])])
    const result = placePath(t, elkInDocOrder(t), 'desktop')
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    const { nodes, headers, height } = result.value
    expect([nodes.a?.cy, nodes.b?.cy, nodes.c?.cy]).toEqual([232, 356, 480])
    expect(headers[1]?.top).toBe(480 + 84)
    expect(nodes.d?.cy).toBe(564 + 120 + 104)
    expect(height).toBe(788 + 40 + 64)
  })

  it('returns layout_failed when elkjs drops a node', () => {
    const elk = elkInDocOrder(small)
    elk.children = elk.children?.filter(c => c.id !== 'c')
    const result = placePath(small, elk, 'desktop')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.kind).toBe('layout_failed')
  })

  it('returns layout_failed when elkjs reorders Main_Nodes', () => {
    const elk = elkInDocOrder(small)
    const c = elk.children?.find(n => n.id === 'c')
    if (c) c.y = -1
    const result = placePath(small, elk, 'mobile')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.kind).toBe('layout_failed')
  })
})

describe('computePathLayout', () => {
  it('lays out a tree with real elkjs on both viewports', async () => {
    for (const viewport of ['mobile', 'desktop'] as const) {
      const result = await computePathLayout(small, viewport, new ELK())
      if (!result.ok) throw new Error(JSON.stringify(result.errors))
      expect(Object.keys(result.value.nodes).sort()).toEqual(['a', 'b', 'c', 'm', 'side'])
      expect(result.value.nodes.side?.cx).toBe(LAYOUT_CONFIG[viewport].sideX)
    }
  })

  it('returns unsupported_order before calling elkjs', async () => {
    const t = tree([node('a', ['b']), node('b')])
    const elk = { layout: () => Promise.reject(new Error('should not run')) }
    const result = await computePathLayout(t, 'mobile', elk)
    expect(result).toEqual({ ok: false, errors: { kind: 'unsupported_order', nodeId: 'a', prerequisiteId: 'b' } })
  })

  it('turns an elkjs throw into layout_failed', async () => {
    const elk = { layout: () => Promise.reject(new Error('boom')) }
    const result = await computePathLayout(small, 'desktop', elk)
    expect(result).toEqual({ ok: false, errors: { kind: 'layout_failed', message: 'boom' } })
  })
})
describe('Sample_Tree layout (Req 5.1, 5.5)', () => {
  const samplePath = fileURLToPath(new URL('../../data/sample-bouldering.json', import.meta.url))
  function loadSample(): SkillTree {
    const result = loadSkillTree(JSON.parse(readFileSync(samplePath, 'utf8')) as unknown)
    if (!result.ok) throw new Error(`Sample_Tree failed to load: ${JSON.stringify(result.errors)}`)
    return result.value
  }
  it('buildElkGraph(sample) uses layered/DOWN and has every prerequisite edge', () => {
    const sample = loadSample()
    const graph = buildElkGraph(sample, LAYOUT_CONFIG.mobile)
    expect(graph.layoutOptions?.['elk.algorithm']).toBe('layered')
    expect(graph.layoutOptions?.['elk.direction']).toBe('DOWN')
    const ids = sample.sections.flatMap(s => s.nodes.map(n => n.id))
    expect(graph.children?.map(c => c.id)).toEqual(ids)
    const edges = new Set(graph.edges?.map(e => `${e.sources[0]}->${e.targets[0]}`))
    const prereqEdges = sample.sections.flatMap(s => s.nodes.flatMap(n => n.prerequisites.map(p => `${p}->${n.id}`)))
    expect(prereqEdges).toHaveLength(12)
    for (const e of prereqEdges) expect(edges).toContain(e)
  })
  it('places "Falling safely" at cx = 110, between the labels of "Reading grades" and "Warm-up routine" (mobile)', async () => {
    const result = await computePathLayout(loadSample(), 'mobile', new ELK())
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    const { nodes } = result.value
    const side = nodes['falling-safely']
    const prev = nodes['reading-grades']
    const next = nodes['warm-up-routine']
    if (!side || !prev || !next) throw new Error('missing sample nodes')
    expect(side.kind).toBe('side')
    expect(side.cx).toBe(110)
    expect(side.cy).toBe(prev.cy + 40 + 32)
    expect(next.cy - prev.cy).toBe(40 + 64 + 64 + 40)
  })
})

describe('bandAwareTrailDots', () => {
  const a = { id: 'a', kind: 'main' as const, cx: 0, cy: 0, size: 72 }
  const b = { id: 'b', kind: 'main' as const, cx: -60, cy: 272, size: 72 }

  it('matches trailDots when no band is crossed', () => {
    expect(bandAwareTrailDots(a, b, [])).toEqual(trailDots({ x: 0, y: 0 }, { x: -60, y: 272 }))
  })

  it('starts the branch from a Main_Node to a side quest at the Main_Node\'s lower edge', () => {
    const side = { id: 's', kind: 'side' as const, cx: 110, cy: 72, size: 64 }
    const below = { id: 't', kind: 'side' as const, cx: 110, cy: 212, size: 64 }
    expect(trailStart(a, side)).toEqual({ x: 0, y: 36 })
    expect(trailStart(a, b)).toEqual({ x: 0, y: 0 })
    expect(trailStart(side, below)).toEqual({ x: 110, y: 72 })
    expect(bandAwareTrailDots(a, side, [])).toEqual(trailDots({ x: 0, y: 36 }, { x: 110, y: 72 }))
  })

  it('draws no dots when the segment crosses a header band', () => {
    expect(bandAwareTrailDots(a, b, [{ top: 76, bottom: 180 }])).toEqual([])
  })
})
