/**
 * Filter stage (pure). Drops candidates that are too long, too short (unless the
 * skill is a quick-tip skill), not embeddable, or in another audio language.
 */
import type { VideoDetails } from './provider'

export const MAX_DURATION_SECONDS = 1500
export const MIN_DURATION_SECONDS = 60

export interface FilterContext {
  /** Language_Code of the pool, or 'und'. */
  language: string
  quickTip: boolean
}

function primarySubtag(lang: string): string {
  return (lang.trim().split(/[-_]/)[0] ?? '').toLowerCase()
}

function passes(c: VideoDetails, ctx: FilterContext): boolean {
  // Unknown embeddable is kept: the search already set videoEmbeddable=true.
  if (c.embeddable === false) return false

  const d = c.durationSeconds
  if (d === null || !Number.isFinite(d) || d <= 0) return false
  if (d > MAX_DURATION_SECONDS) return false
  if (!ctx.quickTip && d < MIN_DURATION_SECONDS) return false

  if (ctx.language !== 'und' && c.defaultAudioLanguage && c.defaultAudioLanguage.trim() !== '') {
    if (primarySubtag(c.defaultAudioLanguage) !== ctx.language.toLowerCase()) return false
  }
  return true
}

/** Returns the passing candidates in their original order. An empty result is not an error. */
export function filterCandidates(
  candidates: readonly VideoDetails[],
  ctx: FilterContext,
): VideoDetails[] {
  return candidates.filter(c => passes(c, ctx))
}
