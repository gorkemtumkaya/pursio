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

/** Monday to Sunday of the week containing `now`, each done, missed or upcoming (Req 2.1). */
export function weekDays(completions: readonly number[], now: number): WeekDay[] {
  const days = new Set(completions.map(localDayKey))
  const today = new Date(now)
  const todayKey = dayKeyOf(today)
  const monday = addDays(today, -((today.getDay() + 6) % 7))
  return DAY_NAMES.map((name, i) => {
    const date = dayKeyOf(addDays(monday, i))
    // Keys compare correctly as strings because they are zero-padded.
    const status: WeekDayStatus = days.has(date) ? 'done' : date > todayKey ? 'upcoming' : 'missed'
    return { date, name, short: name.charAt(0), status }
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
