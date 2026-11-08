// Placeholder data shown only in Demo_Mode (`/path?demo=1`), so the demo keeps
// the look of the reference design (spec: local-progress-data, Req 1.5, 2.4, 4.6).
import type { WeekDayStatus } from '#shared/utils/streak'
import type { HobbyEntry } from './hobby-store'

/** `planned` exists only in the demo week; real weeks have no plans yet. */
export type CardDayStatus = WeekDayStatus | 'planned'

export interface CardDay {
  name: string
  short: string
  status: CardDayStatus
}

export const DEMO_STREAK = 6

export const DEMO_WEEK: readonly CardDay[] = [
  { short: 'M', name: 'Monday', status: 'done' },
  { short: 'T', name: 'Tuesday', status: 'missed' },
  { short: 'W', name: 'Wednesday', status: 'done' },
  { short: 'T', name: 'Thursday', status: 'missed' },
  { short: 'F', name: 'Friday', status: 'done' },
  { short: 'S', name: 'Saturday', status: 'planned' },
  { short: 'S', name: 'Sunday', status: 'missed' },
]

export const DEMO_WEEK_SUMMARY = '3 of 4 sessions'

export const DEMO_ACTIVE_ID = 'demo'

/** The Sample_Tree's hobby plus a static second hobby; neither navigates (`to: null`). */
export function demoHobbyEntries(hobby: string): HobbyEntry[] {
  return [
    { id: DEMO_ACTIVE_ID, hobby, percent: 0, to: null },
    { id: 'demo-film-photography', hobby: 'Film photography', percent: 12, to: null },
  ]
}
