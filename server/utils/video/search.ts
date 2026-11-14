/**
 * Search stage (Req 3.1, 3.7 to 3.11, 9.1). One provider call per Search_Query, started in
 * parallel. Quota is reserved before any call starts, so errored calls stay counted.
 * The search parameters come only from the query text, the Language_Code and fixed values.
 */
import type { QuotaGate } from './quota'
import type { SearchHit, VideoProvider } from './provider'
import { ProviderError } from './provider'

export const MAX_QUERIES = 5
export const MAX_RESULTS_PER_SEARCH = 10

/** Outcome of one search call. */
export type SingleSearch = { ok: true, hits: SearchHit[] } | { ok: false }

export type SearchClass = 'provider_failure' | 'empty' | 'candidates'

/**
 * Pure classification of all search outcomes (Req 3.9, 3.10, 3.11):
 * every search failed, or some failed and the rest returned 0 hits -> provider_failure;
 * all succeeded with 0 hits in total -> empty; otherwise candidates.
 */
export function classifySearch(outcomes: readonly SingleSearch[]): SearchClass {
  if (outcomes.length === 0) return 'empty'
  let failed = 0
  let hits = 0
  for (const o of outcomes) {
    if (o.ok) hits += o.hits.length
    else failed++
  }
  if (failed === outcomes.length) return 'provider_failure'
  if (hits === 0) return failed > 0 ? 'provider_failure' : 'empty'
  return 'candidates'
}

/** Merges hit lists in query order; each video id appears once, first occurrence wins (Req 3.7). */
export function mergeHits(lists: readonly (readonly SearchHit[])[]): SearchHit[] {
  const seen = new Set<string>()
  const merged: SearchHit[] = []
  for (const list of lists) {
    for (const hit of list) {
      if (seen.has(hit.id)) continue
      seen.add(hit.id)
      merged.push(hit)
    }
  }
  return merged
}

export type SearchStageResult
  = | { kind: 'blocked' }
    | { kind: 'provider_failure' }
    | { kind: 'empty' }
    | { kind: 'candidates', hits: SearchHit[] }

export interface SearchStageDeps {
  provider: VideoProvider
  gate: QuotaGate
  signal?: AbortSignal
}

/**
 * Runs the search stage for one Skill. When the quota gate refuses a call, no call is
 * started and the stage reports `blocked` (units already reserved for earlier queries
 * stay counted, which is the conservative side).
 */
export async function searchAll(
  deps: SearchStageDeps,
  queries: readonly string[],
  language: string,
): Promise<SearchStageResult> {
  const list = queries.slice(0, MAX_QUERIES)
  if (list.length === 0) return { kind: 'empty' }

  for (let i = 0; i < list.length; i++) {
    const reserved = await deps.gate.reserveSearch()
    if (!reserved) return { kind: 'blocked' }
  }

  const outcomes = await Promise.all(list.map(async (q): Promise<SingleSearch> => {
    try {
      const hits = await deps.provider.search(q, MAX_RESULTS_PER_SEARCH, {
        language,
        signal: deps.signal,
      })
      return { ok: true, hits }
    }
    catch (err) {
      if (err instanceof ProviderError && err.kind === 'quota_exceeded') {
        try {
          await deps.gate.markExceeded()
        }
        catch {
          // The failure is already reported through the outcome.
        }
      }
      return { ok: false }
    }
  }))

  const cls = classifySearch(outcomes)
  if (cls === 'provider_failure') return { kind: 'provider_failure' }
  if (cls === 'empty') return { kind: 'empty' }
  return {
    kind: 'candidates',
    hits: mergeHits(outcomes.map(o => (o.ok ? o.hits : []))),
  }
}
