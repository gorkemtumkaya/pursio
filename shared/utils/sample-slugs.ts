// Routing rules of the sample pages (spec: sample-path, Requirements 1 and 10). Shared, because
// nuxt.config.ts reads SAMPLE_SLUGS for the prerender rules.
import type { SampleSlug } from '../types/sample-path'

export const SAMPLE_SLUGS = ['photography', 'guitar', 'birdwatching'] as const satisfies readonly SampleSlug[]

/** Longest hobby text taken from a slug, the hobby field's limit. */
const HOBBY_TEXT_MAX = 60

/** Longest campaign value copied into a URL (Req 10.6). */
const CAMPAIGN_VALUE_MAX = 200

/** Campaign_Params: carried through the redirect and the handoff (Req 10.6, AS9). */
export const CAMPAIGN_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'rdt_cid',
  'gclid',
  'fbclid',
  'ttclid',
  'msclkid',
] as const

/** Exact match only: `Guitar` or `guitar/` is not a Sample_Slug (Req 1.1). */
export function isSampleSlug(value: unknown): value is SampleSlug {
  return typeof value === 'string' && (SAMPLE_SLUGS as readonly string[]).includes(value)
}

/** Letters, digits, spaces, apostrophes, `&` and `.` only (Req 1.3, AS1). */
const HOBBY_TEXT = /^[\p{L}\p{N} '’&.]+$/u

function decoded(raw: string): string | null {
  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

/**
 * The hobby text of a slug that is not a Sample_Slug (Req 1.3): hyphens and underscores become
 * spaces, runs of spaces become one, trimmed, cut to 60 characters. Null when nothing usable is left.
 */
export function hobbyTextFromSlug(raw: string): string | null {
  const text = decoded(raw)
  if (text === null) return null
  const spaced = text.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  const cut = Array.from(spaced).slice(0, HOBBY_TEXT_MAX).join('').trim()
  if (cut === '' || !HOBBY_TEXT.test(cut)) return null
  return cut
}

/** The Campaign_Params of a route query: string values of 1 to 200 characters; for a list, its first value. */
export function campaignQuery(query: Readonly<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of CAMPAIGN_KEYS) {
    if (!Object.hasOwn(query, key)) continue
    const raw = query[key]
    const value: unknown = Array.isArray(raw) ? raw[0] : raw
    if (typeof value === 'string' && value.length >= 1 && value.length <= CAMPAIGN_VALUE_MAX) out[key] = value
  }
  return out
}

/**
 * Where an unknown slug goes (Req 1.2, 1.3): `/new` with the Campaign_Params, plus the hobby text
 * and `start=0` when the slug gives one, so the hobby is filled but nothing starts.
 */
export function unknownSlugTarget(
  raw: string,
  query: Readonly<Record<string, unknown>>,
): { path: '/new'; query: Record<string, string> } {
  const hobby = hobbyTextFromSlug(raw)
  const campaign = campaignQuery(query)
  return { path: '/new', query: hobby === null ? campaign : { ...campaign, hobby, start: '0' } }
}
