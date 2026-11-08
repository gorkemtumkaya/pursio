import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import type { SkillNode, SkillTree } from '#shared/types/skill-tree'
import type { ElkNode } from 'elkjs/lib/elk-api'
import { buildElkGraph, checkPathOrder, computePathLayout, LAYOUT_CONFIG, placePath, trailDots } from '~/utils/path-layout'
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
      sideLabelReserve: 40, sideGap: 12, bottomPadding: 120, dotDiameter: 8, ringPad: 9,
    })
    expect(LAYOUT_CONFIG.desktop).toEqual({
      windingOffsets: [0, -90, -135, -90], rowGap: 124, sideX: 170,
      size: { main: 80, milestone: 92, side: 70 },
      headerHeight: 120, headerTop: 8, sectionLead: 104, sectionTail: 84,
      sideLabelReserve: 44, sideGap: 12, bottomPadding: 64, dotDiameter: 10, ringPad: 10,
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
      { sectionIndex: 1, top: 512, height: 104 },
    ])
    expect(l.nodes).toEqual({
      a: { id: 'a', kind: 'main', cx: 0, cy: 212, size: 72 },
      b: { id: 'b', kind: 'main', cx: -60, cy: 324, size: 72 },
      c: { id: 'c', kind: 'main', cx: -90, cy: 436, size: 72 },
      side: { id: 'side', kind: 'side', cx: 110, cy: 380, size: 64 },
      m: { id: 'm', kind: 'milestone', cx: -60, cy: 708, size: 84 },
    })
    expect(l.height).toBe(750 + 120)
    expect(l.segments.map(s => [s.fromId, s.toId])).toEqual([['a', 'b'], ['b', 'side'], ['b', 'c'], ['c', 'm']])
    expect(l.segments[0]?.dots).toEqual(trailDots({ x: 0, y: 212 }, { x: -60, y: 324 }))
    expect(l.dotDiameter).toBe(8)
    expect(l.ringPad).toBe(9)
  })

  it('pushes a side quest below a header band and below an earlier side quest', () => {
    const t = tree(
      [node('a'), node('s1', ['a'], { optional: true }), node('s2', ['a'], { optional: true })],
      [node('b', ['a'])],
    )
    const result = placePath(t, elkInDocOrder(t), 'mobile')
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    const { nodes, headers } = result.value
    // a at 212, section tail -> header 2 at [288, 392], b at 484.
    expect(headers[1]).toEqual({ sectionIndex: 1, top: 288, height: 104 })
    // s1 desired 348 overlaps header 2, moved to band bottom + 32.
    expect(nodes.s1?.cy).toBe(392 + 32)
    // s2 desired 348 -> header, then below s1 footprint (424 + 32 + 40) + sideGap 12.
    expect(nodes.s2?.cy).toBe(424 + 32 + 40 + 12 + 32)
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
  it('places "Falling safely" at cx = 110, midway between "Reading grades" and "Warm-up routine" (mobile)', async () => {
    const result = await computePathLayout(loadSample(), 'mobile', new ELK())
    if (!result.ok) throw new Error(JSON.stringify(result.errors))
    const { nodes } = result.value
    const side = nodes['falling-safely']
    const prev = nodes['reading-grades']
    const next = nodes['warm-up-routine']
    if (!side || !prev || !next) throw new Error('missing sample nodes')
    expect(side.kind).toBe('side')
    expect(side.cx).toBe(110)
    expect(side.cy).toBe((prev.cy + next.cy) / 2)
  })
})
