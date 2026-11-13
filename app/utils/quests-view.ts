// Pure view models of the Quests page. Every function takes `now` as an argument.
import type { DailyPick, WeeklyReward } from '#shared/types/cloud'
import type { Progress, QuestId } from '#shared/types/progress'
import type { SkillNode, SkillTree } from '#shared/types/skill-tree'
import { findCurrentNodeId, findNode, isQuestTicked, openNodes } from '#shared/utils/progress-engine'
import {
  activeDaysInWeek,
  daysLeftInWeek,
  msUntilNextMidnight,
  questLogWeek,
  weekKeyOf,
  type QuestLogStatus,
} from '#shared/utils/streak'
import { WEEKLY_TARGET_DAYS } from './quest-rules'

const HOUR_MS = 3_600_000
const MINUTE_MS = 60_000
const INDEXES = [0, 1, 2] as const

/** "RESETS IN 9H" (whole hours, rounded down, when 1 h or more), else "RESETS IN 42M" (minimum 1M). */
export function resetsInLabel(now: number): string {
  const ms = msUntilNextMidnight(now)
  if (ms >= HOUR_MS) return `RESETS IN ${Math.floor(ms / HOUR_MS)}H`
  return `RESETS IN ${Math.max(1, Math.floor(ms / MINUTE_MS))}M`
}

/** "3 days left" | "1 day left" | "Last day". */
export function daysLeftLabel(now: number): string {
  const left = daysLeftInWeek(now)
  if (left <= 0) return 'Last day'
  return left === 1 ? '1 day left' : `${left} days left`
}

export interface TodayRow {
  key: string
  quest: QuestId
  text: string
  nodeTitle: string
  ticked: boolean
  ariaLabel: string
}

export interface TodayView {
  rows: TodayRow[]
  done: number
  total: number
  ringDegrees: number
  ringLabel: string
  hint: 'bonus' | 'earned' | null
  caughtUp: boolean
  resets: string
}

export function todayView(
  tree: SkillTree,
  progress: Progress,
  pick: DailyPick | null,
  now: number,
): TodayView {
  const rows: TodayRow[] = []
  for (const quest of pick?.quests ?? []) {
    const node = findNode(tree, quest.id)
    if (node === undefined) continue
    const text = node.quests[quest.index]
    rows.push({
      key: `${quest.id}:${quest.index}`,
      quest,
      text,
      nodeTitle: node.title,
      ticked: isQuestTicked(progress, quest),
      ariaLabel: `${text}, ${node.title}`,
    })
  }
  const total = rows.length
  const done = rows.filter((row) => row.ticked).length
  const hint = pick?.bonus === true ? 'earned' : total === 3 ? 'bonus' : null
  return {
    rows,
    done,
    total,
    ringDegrees: total === 0 ? 0 : (360 * done) / total,
    ringLabel: `${done} of ${total} quests done`,
    hint,
    caughtUp: total === 0,
    resets: resetsInLabel(now),
  }
}

export interface WeeklyView {
  filled: number
  segments: boolean[]
  text: string
  srText: string
  daysLeft: string
}

export function weeklyView(
  tickTimes: readonly number[],
  weekly: WeeklyReward | null,
  now: number,
): WeeklyView {
  const filled = Math.min(activeDaysInWeek(tickTimes, now), WEEKLY_TARGET_DAYS)
  const earned = weekly !== null && weekly.week === weekKeyOf(now)
  return {
    filled,
    segments: Array.from({ length: WEEKLY_TARGET_DAYS }, (_, i) => i < filled),
    text: earned ? 'Reward earned: +50 XP' : `${filled} of ${WEEKLY_TARGET_DAYS} · Reward: +50 XP`,
    srText: `${filled} of ${WEEKLY_TARGET_DAYS} days`,
    daysLeft: daysLeftLabel(now),
  }
}

export interface LogBox {
  date: string
  name: string
  short: string
  /** Accessible name, e.g. "Monday, 2 quests". */
  label: string
  /** Number shown in the box; null for upcoming days. */
  display: number | null
  style: QuestLogStatus
}

export function logView(tickTimes: readonly number[], now: number): LogBox[] {
  return questLogWeek(tickTimes, now).map((day) => {
    const upcoming = day.status === 'upcoming'
    return {
      date: day.date,
      name: day.name,
      short: day.short,
      label: upcoming
        ? `${day.name}, upcoming`
        : `${day.name}, ${day.count} ${day.count === 1 ? 'quest' : 'quests'}`,
      display: upcoming ? null : day.count,
      style: day.status,
    }
  })
}

export interface PathCard {
  node: SkillNode
  kind: 'current' | 'side'
  label: 'Current skill' | 'Side quest'
  ticked: number
  percent: number
  nextText: string | null
}

function cardFor(node: SkillNode, progress: Progress, kind: PathCard['kind']): PathCard {
  const ticked = INDEXES.filter((index) => isQuestTicked(progress, { id: node.id, index })).length
  const nextIndex = INDEXES.find((index) => !isQuestTicked(progress, { id: node.id, index }))
  return {
    node,
    kind,
    label: kind === 'current' ? 'Current skill' : 'Side quest',
    ticked,
    percent: Math.round((ticked / 3) * 100),
    nextText: nextIndex === undefined ? null : node.quests[nextIndex],
  }
}

/** Current_Node card plus the first open side quest. Empty without a Current_Node. */
export function pathCards(tree: SkillTree, progress: Progress): PathCard[] {
  const currentId = findCurrentNodeId(tree, progress)
  if (currentId === null) return []
  const current = findNode(tree, currentId)
  if (current === undefined) return []
  const cards = [cardFor(current, progress, 'current')]
  const side = openNodes(tree, progress).find((node) => node.optional && node.id !== current.id)
  if (side !== undefined) cards.push(cardFor(side, progress, 'side'))
  return cards
}
