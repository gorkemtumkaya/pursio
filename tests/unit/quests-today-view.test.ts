import { describe, expect, it } from 'vitest'
import type { DailyPick } from '../../shared/types/cloud'
import type { Progress, QuestId } from '../../shared/types/progress'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { todayView } from '../../app/utils/quests-view'

// The Today card names the skill once when all its quests share it (spec: quests-page, Req 5.2).

const node = (id: string, title: string): SkillNode => ({
  id,
  title,
  description: `${id} description`,
  prerequisites: [],
  optional: false,
  milestone: false,
  quests: ['q1', 'q2', 'q3'],
})

const tree: SkillTree = {
  hobby: 'yoga',
  mascot: { set: 'bouldering' },
  sections: [{ title: 'Beginner', level: 'beginner', nodes: [node('a', 'Basic sun salutation'), node('b', 'Breathing')] }],
}

const none: Progress = { completed: [], quests: {} }
const NOW = Date.UTC(2026, 0, 15, 12)
const q = (id: string, index: 0 | 1 | 2): QuestId => ({ id, index })
const pick = (quests: QuestId[]): DailyPick => ({ day: '2026-01-15', quests, bonus: false })

describe('todayView sharedNodeTitle', () => {
  it('is the skill title when every quest comes from one skill', () => {
    const view = todayView(tree, none, pick([q('a', 0), q('a', 1), q('a', 2)]), NOW)
    expect(view.sharedNodeTitle).toBe('Basic sun salutation')
    expect(view.rows.map((row) => row.nodeTitle)).toEqual(Array(3).fill('Basic sun salutation'))
  })

  it('is null when the quests come from different skills', () => {
    expect(todayView(tree, none, pick([q('a', 0), q('a', 1), q('b', 0)]), NOW).sharedNodeTitle).toBeNull()
  })

  it('is null for a single quest and for no pick, where each row keeps its own title', () => {
    expect(todayView(tree, none, pick([q('a', 0)]), NOW).sharedNodeTitle).toBeNull()
    expect(todayView(tree, none, null, NOW).sharedNodeTitle).toBeNull()
  })
})
