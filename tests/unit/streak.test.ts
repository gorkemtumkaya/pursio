import { describe, expect, it } from 'vitest'
import {
  appendCompletion,
  COMPLETION_LOG_LIMIT,
  localDayKey,
  streakDays,
  weekDays,
  weekSummary,
} from '../../shared/utils/streak'

/** Local-time timestamp, so the tests pass in any time zone. */
const at = (y: number, m: number, d: number, h = 12): number => new Date(y, m - 1, d, h).getTime()

// Wednesday 2026-11-11, mid-afternoon.
const NOW = at(2026, 11, 11, 15)

describe('localDayKey', () => {
  it('uses local time and zero-pads', () => {
    expect(localDayKey(at(2026, 3, 5, 0))).toBe('2026-03-05')
    expect(localDayKey(at(2026, 3, 5, 23))).toBe('2026-03-05')
  })
})

describe('streakDays', () => {
  it('is 0 for an empty log', () => {
    expect(streakDays([], NOW)).toBe(0)
  })

  it('counts today alone as 1', () => {
    expect(streakDays([at(2026, 11, 11, 9)], NOW)).toBe(1)
  })

  it('still counts a streak that ended yesterday', () => {
    expect(streakDays([at(2026, 11, 9), at(2026, 11, 10)], NOW)).toBe(2)
  })

  it('is 0 when the last completion is older than yesterday', () => {
    expect(streakDays([at(2026, 11, 8), at(2026, 11, 9)], NOW)).toBe(0)
  })

  it('stops at the first gap and counts several completions on one day once', () => {
    const log = [at(2026, 11, 7), at(2026, 11, 9, 8), at(2026, 11, 9, 20), at(2026, 11, 10), at(2026, 11, 11)]
    expect(streakDays(log, NOW)).toBe(3)
  })

  it('ignores completion order', () => {
    const log = [at(2026, 11, 11), at(2026, 11, 9), at(2026, 11, 10)]
    expect(streakDays(log, NOW)).toBe(3)
  })

  it('crosses month and DST boundaries day by day', () => {
    // 2026-03-29 is the EU DST change, 2026-03-08 the US one; both sit inside these runs.
    const eu = Array.from({ length: 10 }, (_, i) => at(2026, 3, 25 + i, 0))
    expect(streakDays(eu, at(2026, 4, 3, 23))).toBe(10)
    const us = Array.from({ length: 5 }, (_, i) => at(2026, 3, 6 + i, 1))
    expect(streakDays(us, at(2026, 3, 10, 22))).toBe(5)
  })
})

describe('weekDays', () => {
  it('starts on Monday and marks done, missed and upcoming days', () => {
    const days = weekDays([at(2026, 11, 9), at(2026, 11, 11, 8), at(2026, 11, 6)], NOW)
    expect(days.map((d) => d.date)).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
    ])
    expect(days.map((d) => d.status)).toEqual(['done', 'missed', 'done', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
    expect(days.map((d) => d.short).join('')).toBe('MTWTFSS')
    expect(days[0]!.name).toBe('Monday')
  })

  it('marks today missed until something is completed', () => {
    expect(weekDays([], NOW)[2]!.status).toBe('missed')
  })

  it('puts Sunday at the end of its own week', () => {
    const sunday = at(2026, 11, 15, 10)
    const days = weekDays([sunday], sunday)
    expect(days[0]!.date).toBe('2026-11-09')
    expect(days[6]!.status).toBe('done')
  })

  it('summarizes done days', () => {
    expect(weekSummary(weekDays([], NOW))).toBe('0 days this week')
    expect(weekSummary(weekDays([at(2026, 11, 10)], NOW))).toBe('1 day this week')
    expect(weekSummary(weekDays([at(2026, 11, 9), at(2026, 11, 10)], NOW))).toBe('2 days this week')
  })
})

describe('appendCompletion', () => {
  it('appends without changing the input', () => {
    const log = [1, 2]
    expect(appendCompletion(log, 3)).toEqual([1, 2, 3])
    expect(log).toEqual([1, 2])
  })

  it('keeps only the most recent entries', () => {
    const full = Array.from({ length: COMPLETION_LOG_LIMIT }, (_, i) => i)
    const next = appendCompletion(full, 5000)
    expect(next).toHaveLength(COMPLETION_LOG_LIMIT)
    expect(next[0]).toBe(1)
    expect(next.at(-1)).toBe(5000)
  })
})
