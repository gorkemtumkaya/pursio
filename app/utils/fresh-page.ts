import type { FreshView } from '#shared/utils/fresh-view'
import { relativeTime } from '#shared/utils/fresh-view'
import { hobbyPath } from './hobby-store'

export type FreshStatusKind = 'loading' | 'error' | 'ready'

/** What the Fresh_Page main column shows (spec: fresh, Req 14.6, 14.7, 16.1 to 16.6). */
export interface FreshPageState {
  kind: 'loading' | 'error' | 'no_paths' | 'saved' | 'saved_empty' | 'content' | 'empty'
  /** "No new videos today. Here are the best ones for your skills." (Req 16.2). */
  quietLine: boolean
  chips: boolean
  /** Sources_Panel on desktop and the "Sources" button on mobile. */
  sources: boolean
  hero: boolean
  newSection: boolean
  bestSection: boolean
}

const NOTHING = { quietLine: false, chips: false, sources: false, hero: false, newSection: false, bestSection: false }

/**
 * The page state from the request status and the view. While loading or after an error
 * nothing but that state shows (Req 16.4, 16.6); with no paths only Wick and "Build your
 * first path" (Req 16.1); "Saved" shows its list or its empty line and no Hero_Card (Req 14.6,
 * 14.7, 12.7); otherwise the hero and sections that have cards, the quiet line or the empty
 * state, with the chips and sources kept (Req 16.2, 16.3).
 */
export function freshPageState(status: FreshStatusKind, view: FreshView | null, pathCount: number): FreshPageState {
  if (status === 'loading') return { kind: 'loading', ...NOTHING }
  if (status === 'error') return { kind: 'error', ...NOTHING }
  if (!view || pathCount === 0) return { kind: 'no_paths', ...NOTHING }
  const kept = { chips: true, sources: true }
  if (view.chip.kind === 'saved') {
    return {
      kind: view.saved.length === 0 ? 'saved_empty' : 'saved',
      ...NOTHING,
      ...kept,
    }
  }
  if (view.state === 'empty') return { kind: 'empty', ...NOTHING, ...kept }
  return {
    kind: 'content',
    ...kept,
    quietLine: view.quietLine,
    hero: view.hero !== null,
    newSection: view.newCards.length > 0,
    bestSection: view.bestCards.length > 0,
  }
}

/** "Updated <relative time>" text, or null to hide it (Req 11.5, 11.6). */
export function updatedLabel(updatedMs: number | null, nowMs: number | null): string | null {
  return updatedMs === null || nowMs === null ? null : relativeTime(nowMs, updatedMs)
}

/**
 * Skill tag link (Req 13.4): the Path page of the matched path with the matched Skill_Sheet
 * open, or `/path?demo=1&skill=<id>` in Demo_Mode. Null when the path is unknown.
 */
export function skillLink(
  paths: readonly { id: string; hobbyId: string | null }[],
  pathId: string,
  skillId: string,
  demo: boolean,
): string | null {
  if (skillId === '') return null
  const skill = `skill=${encodeURIComponent(skillId)}`
  if (demo) return `/path?demo=1&${skill}`
  const path = paths.find((p) => p.id === pathId)
  if (!path) return null
  return `${hobbyPath(path.hobbyId ?? path.id)}&${skill}`
}
