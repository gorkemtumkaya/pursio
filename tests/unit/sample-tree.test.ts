import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'

const samplePath = fileURLToPath(new URL('../../data/sample-bouldering.json', import.meta.url))
const raw: unknown = JSON.parse(readFileSync(samplePath, 'utf8'))

function loadSample(): SkillTree {
  const result = loadSkillTree(raw)
  if (!result.ok) throw new Error(`Sample_Tree failed to load: ${JSON.stringify(result.errors)}`)
  return result.value
}

const allNodes = (tree: SkillTree): SkillNode[] => tree.sections.flatMap((s) => s.nodes)
const byTitle = (tree: SkillTree, title: string): SkillNode => {
  const found = allNodes(tree).find((n) => n.title === title)
  if (!found) throw new Error(`No node titled "${title}"`)
  return found
}

describe('Sample_Tree (data/sample-bouldering.json)', () => {
  it('passes the schema and the validator with zero errors (3.7)', () => {
    const result = loadSkillTree(raw)
    expect(result.ok ? [] : result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('has the bouldering hobby and mascot set (3.1)', () => {
    const tree = loadSample()
    expect(tree.hobby).toBe('Bouldering')
    expect(tree.mascot.set).toBe('bouldering')
  })

  it('has 2 sections with the right titles and levels (3.2)', () => {
    const tree = loadSample()
    expect(tree.sections.map((s) => [s.title, s.level])).toEqual([
      ['First sessions', 'beginner'],
      ['Technique', 'intermediate'],
    ])
  })

  it('has the 13 node titles in order (3.3)', () => {
    const tree = loadSample()
    expect(tree.sections.map((s) => s.nodes.map((n) => n.title))).toEqual([
      [
        'Gear basics',
        'Reading grades',
        'Falling safely',
        'Warm-up routine',
        'Footwork basics',
        'Body positioning',
        'Resting on the wall',
        'First V2',
      ],
      ['Flagging', 'Heel hooks', 'Toe hooks', 'Reading a route', 'First V4'],
    ])
    expect(allNodes(tree)).toHaveLength(13)
  })

  it('has one side quest, "Falling safely", after "Reading grades" and a dead end (3.4)', () => {
    const tree = loadSample()
    const sideQuests = allNodes(tree).filter((n) => n.optional)
    expect(sideQuests.map((n) => n.title)).toEqual(['Falling safely'])
    const side = byTitle(tree, 'Falling safely')
    expect(side.prerequisites).toEqual([byTitle(tree, 'Reading grades').id])
    const dependents = allNodes(tree).filter((n) => n.prerequisites.includes(side.id))
    expect(dependents).toEqual([])
  })

  it('has one main milestone as the last node of each section (3.5)', () => {
    const tree = loadSample()
    const expected = ['First V2', 'First V4']
    tree.sections.forEach((section, i) => {
      const milestones = section.nodes.filter((n) => n.milestone)
      expect(milestones.map((n) => n.title)).toEqual([expected[i]])
      const last = section.nodes[section.nodes.length - 1]
      expect(last?.title).toBe(expected[i])
      expect(last?.optional).toBe(false)
    })
  })

  it('chains main nodes linearly, each listing only the previous main node (3.6)', () => {
    const tree = loadSample()
    const mains = allNodes(tree).filter((n) => !n.optional)
    expect(mains[0]?.title).toBe('Gear basics')
    expect(mains[0]?.prerequisites).toEqual([])
    for (let i = 1; i < mains.length; i++) {
      const prev = mains[i - 1]
      expect(mains[i]?.prerequisites, mains[i]?.title).toEqual([prev?.id])
    }
    expect(byTitle(tree, 'Flagging').prerequisites).toEqual([byTitle(tree, 'First V2').id])
  })
})
