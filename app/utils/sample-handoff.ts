// Handoff from the sample page to /new (spec: sample-path, Requirement 10). The note travels in
// memory only, for the one client navigation: never in a URL, storage, a cookie or an event.
import { NOTE_MAX } from '#shared/utils/learner-profile'
import { normalizeHobby } from '#shared/utils/llm'
import { campaignQuery } from '#shared/utils/sample-slugs'

/** A handoff older than this is not used (Req 10.4). */
export const HANDOFF_MAX_AGE_MS = 60_000

interface Handoff {
  /** Normalized, for the match with the URL. */
  hobby: string
  note: string
  at: number
}

let pending: Handoff | null = null

/** Where "Build my path" goes: `/new` with the hobby and the Campaign_Params (Req 10.1, 10.6). Never the note. */
export function handoffTarget(
  hobby: string,
  query: Readonly<Record<string, unknown>>,
): { path: '/new'; query: Record<string, string> } {
  return { path: '/new', query: { ...campaignQuery(query), hobby } }
}

/** Keeps the trimmed note, cut to the note limit, for the next `/new` load. */
export function setSampleHandoff(hobby: string, note: string, now: number = Date.now()): void {
  const text = Array.from(note.trim()).slice(0, NOTE_MAX).join('')
  pending = { hobby: normalizeHobby(hobby), note: text, at: now }
}

/**
 * The handed over note when it belongs to `hobby` and is at most 60 s old, else null. Read once:
 * the handoff is removed either way, so a refresh or a later visit starts with no note (Req 10.4, 10.5).
 */
export function takeSampleHandoff(hobby: string, now: number = Date.now()): string | null {
  const handoff = pending
  pending = null
  if (handoff === null) return null
  if (handoff.hobby !== normalizeHobby(hobby)) return null
  if (now - handoff.at < 0 || now - handoff.at > HANDOFF_MAX_AGE_MS) return null
  return handoff.note
}
