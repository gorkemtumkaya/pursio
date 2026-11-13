/** Most recent Completion_Log entries kept in storage (Req 1.4). */
export const COMPLETION_LOG_LIMIT = 1000

export type WeekDayStatus = 'done' | 'missed' | 'upcoming'

export interface WeekDay {
  /** Local_Day key, `YYYY-MM-DD`. */
  date: string
  name: string
  short: string
  status: WeekDayStatus
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DD` of the Local_Day containing `ms`. */
export function localDayKey(ms: number): string {
  return dayKeyOf(new Date(ms))
}

/** Local midnight `offset` days from `date`. Built from parts, so DST shifts never skip or repeat a day. */
function addDays(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset)
}

/**
 * Consecutive Local_Days with at least one completion, ending today, or
 * yesterday when today has none yet. 0 when neither has one (Req 1.2).
 */
export function streakDays(completions: readonly number[], now: number): number {
  const days = new Set(completions.map(localDayKey))
  const today = new Date(now)
  let cursor = days.has(dayKeyOf(today)) ? today : addDays(today, -1)
  let count = 0
  while (days.has(dayKeyOf(cursor))) {
    count++
    cursor = addDays(cursor, -1)
  }
  return count
}

/** The longest run of consecutive Local_Days with at least one completion, at any time. */
export function longestStreak(completions: readonly number[]): number {
  const days = new Set(completions.map(localDayKey))
  let best = 0
  for (const key of days) {
    const [year = 0, month = 1, day = 1] = key.split('-').map(Number)
    const start = new Date(year, month - 1, day)
    // Count only from the first day of each run.
    if (days.has(dayKeyOf(addDays(start, -1)))) continue
    let length = 1
    while (days.has(dayKeyOf(addDays(start, length)))) length++
    best = Math.max(best, length)
  }
  return best
}

/** Local midnight of the Monday of the week containing `date`. */
function mondayOf(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7))
}

/** Monday to Sunday of the week containing `now`, each done, missed or upcoming (Req 2.1). */
export function weekDays(completions: readonly number[], now: number): WeekDay[] {
  const days = new Set(completions.map(localDayKey))
  const today = new Date(now)
  const todayKey = dayKeyOf(today)
  const monday = mondayOf(today)
  return DAY_NAMES.map((name, i) => {
    const date = dayKeyOf(addDays(monday, i))
    // Keys compare correctly as strings because they are zero-padded.
    const status: WeekDayStatus = days.has(date) ? 'done' : date > todayKey ? 'upcoming' : 'missed'
    return { date, name, short: name.charAt(0), status }
  })
}

/** Week_Key: the Local_Day of the Monday of the week containing `ms`. */
export function weekKeyOf(ms: number): string {
  return dayKeyOf(mondayOf(new Date(ms)))
}

/** The 7 Local_Day keys Monday to Sunday of the week containing `now`. */
export function weekDayKeys(now: number): string[] {
  const monday = mondayOf(new Date(now))
  return DAY_NAMES.map((_, i) => dayKeyOf(addDays(monday, i)))
}

/** Distinct Local_Days of the current week that hold at least one of `times`. */
export function activeDaysInWeek(times: readonly number[], now: number): number {
  const week = new Set(weekDayKeys(now))
  const active = new Set<string>()
  for (const time of times) {
    const key = localDayKey(time)
    if (week.has(key)) active.add(key)
  }
  return active.size
}

/** Days left in the week after today: 6 on Monday, 0 on Sunday. */
export function daysLeftInWeek(now: number): number {
  return 6 - ((new Date(now).getDay() + 6) % 7)
}

/** Milliseconds from `now` to the next local midnight, built from date parts so DST days are right. */
export function msUntilNextMidnight(now: number): number {
  return addDays(new Date(now), 1).getTime() - now
}

export type QuestLogStatus = 'done' | 'missed' | 'today' | 'upcoming'

export interface QuestLogDay {
  date: string
  name: string
  short: string
  /** Ticks on that day; 0 for upcoming days (not shown). */
  count: number
  status: QuestLogStatus
}

/** Seven boxes Monday to Sunday with the number of `times` on each Local_Day. */
export function questLogWeek(times: readonly number[], now: number): QuestLogDay[] {
  const counts = new Map<string, number>()
  for (const time of times) {
    const key = localDayKey(time)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const todayKey = localDayKey(now)
  return weekDayKeys(now).map((date, i) => {
    const name = DAY_NAMES[i] ?? ''
    // Keys compare correctly as strings because they are zero-padded.
    const status: QuestLogStatus =
      date === todayKey ? 'today' : date > todayKey ? 'upcoming' : (counts.get(date) ?? 0) > 0 ? 'done' : 'missed'
    return { date, name, short: name.charAt(0), count: status === 'upcoming' ? 0 : (counts.get(date) ?? 0), status }
  })
}

/** "1 day this week" / "3 days this week" (Req 2.2). */
export function weekSummary(days: readonly WeekDay[]): string {
  const done = days.filter((day) => day.status === 'done').length
  return `${done} ${done === 1 ? 'day' : 'days'} this week`
}

/** Appends `ms` and keeps the last `limit` entries (Req 1.1, 1.4). */
export function appendCompletion(
  completions: readonly number[],
  ms: number,
  limit: number = COMPLETION_LOG_LIMIT,
): number[] {
  return [...completions, ms].slice(-limit)
}
