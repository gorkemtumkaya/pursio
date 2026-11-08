import { describe, expect, it } from 'vitest'
import type { NodeState } from '#shared/types/progress'
import {
  buttonFor,
  chipFor,
  detailTitleId,
  formatTitleList,
  nodeVisual,
  ringDegrees,
  statusLine,
} from '~/utils/node-visual'

const STATES: readonly NodeState[] = ['completed', 'current', 'side_quest', 'milestone', 'locked']

describe('nodeVisual', () => {
  it('draws completed nodes done with a check (Req 6.4)', () => {
    for (const isMilestone of [false, true]) {
      const v = nodeVisual('completed', isMilestone)
      expect(v.classes).toContain('bg-done')
      expect(v.classes).toContain('shadow-raised-done')
      expect(v.icon).toBe('check')
      expect(v.ring).toBe(false)
      expect(v.nextUp).toBe(false)
    }
  })

  it('draws the current node primary with a star, ring and NEXT UP (Req 6.5)', () => {
    const v = nodeVisual('current', false)
    expect(v.classes).toContain('bg-primary')
    expect(v.classes).toContain('shadow-raised-primary')
    expect(v.icon).toBe('star')
    expect(v.iconClass).toBe('text-primary-ink')
    expect(v.milestoneSize).toBe(false)
    expect(v.ring).toBe(true)
    expect(v.nextUp).toBe(true)
  })

  it('draws a current milestone gold with a trophy at milestone size (Req 4.12)', () => {
    const v = nodeVisual('current', true)
    expect(v.classes).toContain('bg-gold')
    expect(v.classes).toContain('shadow-raised-gold')
    expect(v.classes).not.toContain('bg-primary')
    expect(v.icon).toBe('trophy')
    expect(v.milestoneSize).toBe(true)
    expect(v.ring).toBe(true)
    expect(v.nextUp).toBe(true)
  })

  it('draws locked nodes with the locked fill and a lock (Req 6.7)', () => {
    const v = nodeVisual('locked', false)
    expect(v.classes).toContain('bg-locked')
    expect(v.classes).toContain('shadow-raised-locked')
    expect(v.icon).toBe('lock')
    expect(v.milestoneSize).toBe(false)
  })

  it('draws side quests on surface with a dashed trail outline and a compass (Req 6.8)', () => {
    const v = nodeVisual('side_quest', false)
    expect(v.classes).toContain('bg-surface')
    expect(v.classes).toContain('shadow-raised-line')
    expect(v.classes).toContain('border-3')
    expect(v.classes).toContain('border-dashed')
    expect(v.classes).toContain('border-trail')
    expect(v.icon).toBe('compass')
  })

  it('draws milestone nodes locked with a trophy at milestone size (Req 6.9)', () => {
    const v = nodeVisual('milestone', true)
    expect(v.classes).toContain('bg-locked')
    expect(v.classes).toContain('shadow-raised-locked')
    expect(v.icon).toBe('trophy')
    expect(v.milestoneSize).toBe(true)
  })

  it('shapes every node with rounded-node and mutes only locked titles (Req 6.10, 6.12)', () => {
    for (const state of STATES) {
      for (const isMilestone of [false, true]) {
        const v = nodeVisual(state, isMilestone)
        expect(v.classes).toContain('rounded-node')
        expect(v.titleClass).toBe(state === 'locked' ? 'text-muted' : 'text-ink')
      }
    }
  })
})

describe('ringDegrees', () => {
  it('fills a third of the ring per checked quest (Req 6.6)', () => {
    expect(ringDegrees(0)).toBe(0)
    expect(ringDegrees(1)).toBe(120)
    expect(ringDegrees(2)).toBe(240)
    expect(ringDegrees(3)).toBe(360)
  })

  it('clamps out-of-range counts', () => {
    expect(ringDegrees(-1)).toBe(0)
    expect(ringDegrees(5)).toBe(360)
  })
})

describe('statusLine', () => {
  it('picks the status text by state (Req 6.11)', () => {
    expect(statusLine('completed', 3)).toBe('Done')
    expect(statusLine('side_quest', 0)).toBe('Side quest')
    expect(statusLine('milestone', 0)).toBe('Milestone')
    expect(statusLine('locked', 0)).toBe('Locked')
    for (const n of [0, 1, 2, 3]) {
      expect(statusLine('current', n)).toBe(`In progress · ${n}/3`)
    }
  })
})

describe('chipFor', () => {
  it('labels the state chip per state (Req 8.4)', () => {
    expect(chipFor('completed').label).toBe('COMPLETED')
    expect(chipFor('current').label).toBe('IN PROGRESS')
    expect(chipFor('side_quest').label).toBe('SIDE QUEST')
    expect(chipFor('milestone').label).toBe('MILESTONE')
    expect(chipFor('locked').label).toBe('LOCKED')
  })
})

describe('buttonFor', () => {
  it('enables "Mark complete" for current and side quest nodes (Req 8.10)', () => {
    for (const state of ['current', 'side_quest'] as const) {
      expect(buttonFor(state)).toMatchObject({ label: 'Mark complete', enabled: true })
    }
  })

  it('disables "Completed" for completed nodes (Req 8.11)', () => {
    expect(buttonFor('completed')).toMatchObject({ label: 'Completed', enabled: false })
  })

  it('disables "Locked" for locked and non-current milestone nodes (Req 8.12)', () => {
    for (const state of ['locked', 'milestone'] as const) {
      expect(buttonFor(state)).toMatchObject({ label: 'Locked', enabled: false })
    }
  })
})

describe('formatTitleList', () => {
  it('joins titles with ", " and " and " before the last (Req 8.9)', () => {
    expect(formatTitleList(['Footwork'])).toBe('Footwork')
    expect(formatTitleList(['Footwork', 'Grips'])).toBe('Footwork and Grips')
    expect(formatTitleList(['Footwork', 'Grips', 'Falling'])).toBe('Footwork, Grips and Falling')
  })
})

describe('detailTitleId', () => {
  it('gives each layout its own stable title id', () => {
    expect(detailTitleId('sheet')).toBe('node-detail-title-sheet')
    expect(detailTitleId('panel')).toBe('node-detail-title-panel')
  })
})
