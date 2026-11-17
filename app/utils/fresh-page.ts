import type { FreshView, NewToday } from '#shared/utils/fresh-view'
import { relativeTime } from '#shared/utils/fresh-view'
import { hobbyPath } from './hobby-store'

export type FreshStatusKind = 'loading' | 'error' | 'ready'

/** What the Fresh_Page main column shows (spec: fresh-v2, Req 10; `fresh` Req 14.6, 14.7, 16.1 to 16.6). */
export interface FreshPageState {
  kind: 'loading' | 'error' | 'no_paths' | 'saved' | 'saved_empty' | 'content' | 'empty'
  /** "No new videos today. Here are the best ones for your skills." (Req 10.2). */
  quietLine: boolean
  chips: boolean
  /** Sources_Panel on desktop and the "Sources" button on mobile. */
  sources: boolean
  hero: boolean
  /** The Hobby_Sections; with `empty` they are header-only (Req 10.3). */
  sections: boolean
}

const NOTHING = { quietLine: false, chips: false, sources: false, hero: false, sections: false }

/**
 * The page state from the request status and the view. While loading or after an error
 * nothing but that state shows; with no paths only Wick and "Build your first path"
 * (`fresh` Req 16.1, 16.4, 16.6); "Saved" shows its list or its empty line, with no Hero_Card
 * and no section (Req 2.7); otherwise the hero and the Hobby_Sections, with the quiet line or
 * the empty state. The empty state keeps each path's header-only section, the chips and the
 * sources (Req 10.2, 10.3).
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
  const sections = view.sections.length > 0
  if (view.state === 'empty') return { kind: 'empty', ...NOTHING, ...kept, sections }
  return {
    kind: 'content',
    ...kept,
    quietLine: view.quietLine,
    hero: view.hero !== null,
    sections,
  }
}

/** Header text of Req 1.4: "1 new video today across 1 hobby" or "<n> new videos today across <m> hobbies". */
export function newTodayText(counts: NewToday): string {
  const videos = counts.videos === 1 ? '1 new video' : `${counts.videos} new videos`
  const hobbies = counts.hobbies === 1 ? '1 hobby' : `${counts.hobbies} hobbies`
  return `${videos} today across ${hobbies}`
}

/** "1 channel", "<n> channels" or "none yet" (Req 8.2). */
export function channelCountText(count: number): string {
  if (count <= 0) return 'none yet'
  return count === 1 ? '1 channel' : `${count} channels`
}

/**
 * Path link of a Hobby_Section (Req 4.7): `/path?demo=1` in Demo_Mode, else the Path page of
 * that hobby, which makes it the active hobby. Null when the path is unknown.
 */
export function pathLink(
  paths: readonly { id: string; hobbyId: string | null }[],
  pathId: string,
  demo: boolean,
): string | null {
  if (demo) return '/path?demo=1'
  const path = paths.find((p) => p.id === pathId)
  if (!path) return null
  return hobbyPath(path.hobbyId ?? path.id)
}

/**
 * Open Sources_Panel groups after the page opened or a chip was selected (Req 8.3): the
 * groups the user left open, plus `selected` (`FreshView.defaultOpenSource`, never a group
 * without channels). Null adds nothing.
 */
export function nextOpenGroups(open: ReadonlySet<string>, selected: string | null): Set<string> {
  const next = new Set(open)
  if (selected !== null) next.add(selected)
  return next
}

/**
 * Open groups after the user activated a group header (Req 8.4, 8.5): the group closes when
 * open and opens when closed, on its own. A group with no entries, or one that is not listed,
 * never opens.
 */
export function toggleGroup(
  open: ReadonlySet<string>,
  key: string,
  groups: readonly { key: string; entries: readonly unknown[] }[],
): Set<string> {
  const next = new Set(open)
  if (next.delete(key)) return next
  const group = groups.find((g) => g.key === key)
  if (group && group.entries.length > 0) next.add(key)
  return next
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
