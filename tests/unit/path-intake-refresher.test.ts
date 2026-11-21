// Refresher_Quests count for nothing (spec: path-intake, Requirement 10, decision 25).
import { describe, expect, it } from 'vitest'
import type { Progress } from '../../shared/types/progress'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { candidateQuests, newDailyPick } from '../../shared/utils/daily-pick'
import { deriveNodeStates, emptyProgress, toggleQuest } from '../../shared/utils/progress-engine'
import { localDayKey } from '../../shared/utils/streak'
import { xpFor } from '../../shared/utils/xp'
import type { CloudPath } from '../../app/utils/cloud-library'
import { profileStats } from '../../app/utils/profile-stats'
import { withProgressReset } from '../../app/utils/progress-reset'
import { applyProgressChange, withDailyPick } from '../../app/utils/quest-rules'

const node = (id: string, prerequisites: string[], knownOptionId?: string): SkillNode => ({
  id,
  title: id,
  description: `${id} description`,
  prerequisites,
  optional: false,
  milestone: false,
  quests: ['q1', 'q2', 'q3'],
  ...(knownOptionId === undefined ? {} : { knownOptionId }),
})

/** Two Known_Nodes, then the first skill to learn. */
const tree: SkillTree = {
  hobby: 'guitar',
  mascot: { set: 'guitar' },
  sections: [
    {
      title: 'Start',
      level: 'beginner',
      nodes: [node('tuning', [], 'holding-tuning'), node('chords', ['tuning'], 'open-chords'), node('changes', ['chords'])],
    },
  ],
}

const NOW = new Date(2026, 10, 19, 10).getTime()
const today = localDayKey(NOW)

function pathOf(progress: Progress = emptyProgress()): CloudPath {
  return {
    pathId: 'p1',
    record: { id: 'guitar', tree, model: 'm', addedAt: 0, archived: false, colorSlot: 1 },
    level: 'some',
    progress,
    completedAt: {},
    questTicks: {},
    dailyPick: null,
    dailyBonusCount: 0,
  }
}

describe('Refresher_Quests (Req 10.2 to 10.4)', () => {
  it('saves a tick, but gives no XP and no Tick_Time', () => {
    const before = pathOf()
    const ticked = toggleQuest(tree, before.progress, 'tuning', 0)
    expect(ticked.quests.tuning).toEqual([true, false, false])
    const change = applyProgressChange([before], { week: null, count: 0 }, 'p1', ticked, NOW)
    expect(change?.write.progress).toBe(ticked)
    expect(change?.write.questTicks).toEqual({})
    expect(xpFor(tree, ticked)).toBe(xpFor(tree, before.progress))
  })

  it('a tick of a skill that is not known still gets its Tick_Time and its XP', () => {
    const ticked = toggleQuest(tree, emptyProgress(), 'changes', 1)
    const change = applyProgressChange([pathOf()], null, 'p1', ticked, NOW)
    expect(change?.write.questTicks).toEqual({ changes: [null, NOW, null] })
    expect(xpFor(tree, ticked)).toBe(60 + 10)
  })

  it('is never in a Daily_Pick, so it can never grant a Daily_Bonus', () => {
    expect(candidateQuests(tree, emptyProgress()).map(quest => quest.id)).toEqual(['changes', 'changes', 'changes'])
    expect(newDailyPick(tree, emptyProgress(), today)?.quests.every(quest => quest.id === 'changes')).toBe(true)
    const picked = withDailyPick([pathOf()], 'p1', NOW)
    expect(picked?.[0]?.dailyPick?.quests.every(quest => quest.id === 'changes')).toBe(true)
    // Ticking every refresher quest grants nothing.
    let progress = emptyProgress()
    for (const id of ['tuning', 'chords']) for (const index of [0, 1, 2] as const) progress = toggleQuest(tree, progress, id, index)
    const withPick = { ...pathOf(), dailyPick: picked?.[0]?.dailyPick ?? null }
    const change = applyProgressChange([withPick], { week: null, count: 0 }, 'p1', progress, NOW)
    expect(change?.grantedDailyBonus).toBe(false)
    expect(change?.grantedWeeklyReward).toBe(false)
  })

  it('is left out of the quest count of the profile page', () => {
    let progress = toggleQuest(tree, emptyProgress(), 'tuning', 0)
    progress = toggleQuest(tree, progress, 'changes', 0)
    expect(profileStats([pathOf(progress)], NOW).questsDone).toBe(1)
  })

  it('a reset clears refresher ticks and keeps the Known_Nodes and their head start', () => {
    const progress = toggleQuest(tree, emptyProgress(), 'tuning', 2)
    for (const mode of ['wipe', 'keep_history'] as const) {
      const [reset] = withProgressReset([pathOf(progress)], 'path', 'p1', mode)
      expect(reset?.progress).toEqual(emptyProgress())
      const states = deriveNodeStates(tree, reset?.progress ?? emptyProgress())
      expect(states.get('tuning')).toBe('completed')
      expect(states.get('chords')).toBe('completed')
      expect(states.get('changes')).toBe('current')
      expect(xpFor(tree, reset?.progress ?? emptyProgress())).toBe(60)
    }
  })
})
