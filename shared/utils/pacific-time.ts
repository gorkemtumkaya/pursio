const ZONE = 'America/Los_Angeles'
const MAX_DAY_MS = 25 * 60 * 60 * 1000

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Calendar day in America/Los_Angeles as 'YYYY-MM-DD', daylight saving applied. */
export function pacificDay(ms: number): string {
  let year = ''
  let month = ''
  let day = ''
  for (const part of formatter.formatToParts(new Date(ms))) {
    if (part.type === 'year') year = part.value
    else if (part.type === 'month') month = part.value
    else if (part.type === 'day') day = part.value
  }
  return `${year}-${month}-${day}`
}

/**
 * Epoch ms of the next 00:00:00 in America/Los_Angeles after `ms`: the first instant
 * where `pacificDay` changes. A Pacific day lasts 23, 24 or 25 hours, so the answer is
 * at most 25 hours away and a binary search over that window finds it.
 */
export function nextPacificMidnight(ms: number): number {
  const today = pacificDay(ms)
  let lo = ms
  let hi = ms + MAX_DAY_MS
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (pacificDay(mid) === today) lo = mid
    else hi = mid
  }
  return hi
}
