import { describe, expect, it } from 'vitest'
import type { Progress } from '../../shared/types/progress'
import type { SkillTree } from '../../shared/types/skill-tree'
import { FINISH_LINE_COPY, finishLineView } from '../../app/utils/finish-line'
import { sampleTree } from '../support/tree-deps'

const TITLE = 'Send your first V4 outdoors'

/** Main_Node ids of the Sample_Tree in path order: 12, with milestones `first-v2` and `first-v4` (the last). */
const MAIN = sampleTree().sections.flatMap(section => section.nodes).filter(node => !node.optional).map(node => node.id)

function progress(completed: string[]): Progress {
  return { completed, quests: {} }
}

describe('finishLineView', () => {
  it('is not started with every Main_Node still to go', () => {
    const view = finishLineView(sampleTree(), progress([]), TITLE)
    expect(view).toEqual({
      state: 'not-started', title: TITLE, done: 0, total: 12, left: 12, percent: 0, nextMilestone: 'First V2', reachedAt: null,
    })
  })

  it('is in progress from the first completed Main_Node and names the next milestone', () => {
    const view = finishLineView(sampleTree(), progress(MAIN.slice(0, 7)), TITLE)
    expect(view).toMatchObject({ state: 'in-progress', done: 7, total: 12, left: 5, percent: 58 })
    // `first-v2` is the 7th Main_Node; the only milestone left is the finish line itself.
    expect(view.nextMilestone).toBeNull()
    expect(finishLineView(sampleTree(), progress(MAIN.slice(0, 3)), TITLE).nextMilestone).toBe('First V2')
  })

  it('does not count side quests', () => {
    const view = finishLineView(sampleTree(), progress(['gear-basics', 'reading-grades', 'falling-safely']), TITLE)
    expect(view).toMatchObject({ done: 2, total: 12, left: 10 })
  })

  it('counts Known_Nodes as done, so a head start shows as progress', () => {
    const tree = sampleTree()
    const known: SkillTree = {
      ...tree,
      sections: tree.sections.map(section => ({
        ...section,
        nodes: section.nodes.map(node => (node.id === 'gear-basics' ? { ...node, knownOptionId: 'gear' } : node)),
      })),
    }
    expect(finishLineView(known, progress([]), TITLE)).toMatchObject({ state: 'in-progress', done: 1, left: 11 })
  })

  it('is reached when the Final_Milestone is completed, with its completion time', () => {
    const at = Date.UTC(2026, 10, 12, 12)
    const view = finishLineView(sampleTree(), progress(MAIN), TITLE, { 'first-v4': at })
    expect(view).toMatchObject({ state: 'reached', done: 12, total: 12, left: 0, percent: 100, nextMilestone: null, reachedAt: at })
  })

  it('has no date when no completion time is stored, and ignores a retained time before the line is reached', () => {
    expect(finishLineView(sampleTree(), progress(MAIN), TITLE).reachedAt).toBeNull()
    // A keep-history reset retains the old time of a Node that is no longer completed.
    expect(finishLineView(sampleTree(), progress([]), TITLE, { 'first-v4': 1 }).reachedAt).toBeNull()
  })
})

describe('FINISH_LINE_COPY', () => {
  it('writes the counts, with a singular for one skill', () => {
    expect(FINISH_LINE_COPY.goal('Play 3 new songs')).toBe('Goal: Play 3 new songs')
    expect(FINISH_LINE_COPY.toGo(12)).toBe('12 skills to go')
    expect(FINISH_LINE_COPY.toGo(1)).toBe('1 skill to go')
    expect(FINISH_LINE_COPY.between(12)).toBe('12 skills between you and this.')
    expect(FINISH_LINE_COPY.count(7, 12)).toBe('7 of 12 skills')
    expect(FINISH_LINE_COPY.left(5)).toBe('5 to go')
    expect(FINISH_LINE_COPY.nextMilestone('First V2')).toBe('Next milestone: First V2')
  })

  it('adds the date only when the finish line has a completion time', () => {
    expect(FINISH_LINE_COPY.reached(12, 12, null)).toBe('12 of 12 skills')
    expect(FINISH_LINE_COPY.reached(12, 12, Date.UTC(2026, 10, 12, 12), 'en-GB')).toBe('12 of 12 skills · reached on 12 Nov 2026')
  })
})
