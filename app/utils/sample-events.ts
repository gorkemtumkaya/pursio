// The four sample page events (spec: sample-path, Requirement 11). Pure, so the once-only rules
// are tested without Nuxt. The tracker takes no note, so the note can never reach an event (Req 11.7).
import type { SampleSlug } from '#shared/types/sample-path'
import type { AnalyticsEvent, AnalyticsProps } from '~/utils/analytics'

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const
const UTM_VALUE_MAX = 200

/** The utm properties of the page URL: string values of 1 to 200 characters; for a list, its first value (Req 11.2). */
export function utmProps(query: Readonly<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    if (!Object.hasOwn(query, key)) continue
    const raw = query[key]
    const value: unknown = Array.isArray(raw) ? raw[0] : raw
    if (typeof value === 'string' && value.length >= 1 && value.length <= UTM_VALUE_MAX) out[key] = value
  }
  return out
}

export type MineSource = 'bar' | 'skill_sheet' | 'top_bar' | 'note_focus'

export interface SampleTracker {
  /** Once per page load, after mount (Req 11.3). */
  viewed(): void
  /** Each time the visitor opens a skill; the page decides what counts (Req 11.4). */
  skillOpened(skillId: string): void
  /** Once per page load, at the first way in (Req 11.5). */
  mineOpened(source: MineSource): void
  /** Once per handoff (Req 11.6). */
  buildClicked(input: { hasNote: boolean; skipped: boolean }): void
}

export function createSampleTracker(
  send: (event: AnalyticsEvent, props: AnalyticsProps) => void,
  base: { hobby: SampleSlug } & Readonly<Record<string, string>>,
): SampleTracker {
  const sent = new Set<'viewed' | 'mine' | 'build'>()
  const once = (key: 'viewed' | 'mine' | 'build', run: () => void): void => {
    if (sent.has(key)) return
    sent.add(key)
    run()
  }
  return {
    viewed: () => once('viewed', () => send('sample_viewed', { ...base })),
    skillOpened: (skillId) => send('sample_skill_opened', { ...base, skill_id: skillId }),
    mineOpened: (source) => once('mine', () => send('sample_mine_opened', { ...base, source })),
    buildClicked: ({ hasNote, skipped }) =>
      once('build', () => send('sample_build_clicked', { ...base, has_note: hasNote, skipped })),
  }
}
