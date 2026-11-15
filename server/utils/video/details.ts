/**
 * Details stage (Req 4.1 to 4.6, 9.1). Batches of at most 50 ids, 1 quota unit per call.
 * Fields the provider could not supply stay null (unknown) on the candidate; candidates
 * missing from the response are dropped.
 */
import type { QuotaGate } from './quota'
import type { VideoDetails, VideoProvider } from './provider'
import { ProviderError } from './provider'

export const DETAILS_BATCH_SIZE = 50

export type DetailsStageResult
  = | { kind: 'ok', details: VideoDetails[] }
    | { kind: 'blocked' }
    | { kind: 'provider_failure' }

export interface DetailsStageDeps {
  provider: VideoProvider
  gate: QuotaGate
  signal?: AbortSignal
}

/** Splits ids into batches of at most `size`. */
export function batchIds(ids: readonly string[], size: number = DETAILS_BATCH_SIZE): string[][] {
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += size) batches.push(ids.slice(i, i + size))
  return batches
}

export type DetailsBatchResult
  = | { ok: true, details: VideoDetails[] }
    | { ok: false }

/**
 * One `getDetails` call for one batch, with quota-exceeded marking (Req 4.5; fresh Req 5.3).
 * Reserves no quota unit: the caller does that before the call. Details for ids outside the
 * batch are dropped. Shared by `fetchDetails` and the Fresh check.
 */
export async function detailsBatch(
  deps: DetailsStageDeps,
  batch: readonly string[],
): Promise<DetailsBatchResult> {
  try {
    const got = await deps.provider.getDetails(batch, { signal: deps.signal })
    const wanted = new Set(batch)
    return { ok: true, details: got.filter(d => wanted.has(d.id)) }
  }
  catch (err) {
    if (err instanceof ProviderError && err.kind === 'quota_exceeded') {
      try {
        await deps.gate.markExceeded()
      }
      catch {
        // The failure is reported below.
      }
    }
    return { ok: false }
  }
}

/**
 * Fetches details for the candidate ids, keeping the input order. An empty id list skips
 * the call (Req 4.6). A failed batch stops the stage and passes no candidates on (Req 4.5).
 */
export async function fetchDetails(
  deps: DetailsStageDeps,
  ids: readonly string[],
): Promise<DetailsStageResult> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return { kind: 'ok', details: [] }

  const byId = new Map<string, VideoDetails>()
  for (const batch of batchIds(unique)) {
    if (!(await deps.gate.reserveDetails())) return { kind: 'blocked' }
    const result = await detailsBatch(deps, batch)
    if (!result.ok) return { kind: 'provider_failure' }
    for (const d of result.details) {
      if (!byId.has(d.id)) byId.set(d.id, d)
    }
  }

  const details: VideoDetails[] = []
  for (const id of unique) {
    const d = byId.get(id)
    if (d) details.push(d)
  }
  return { kind: 'ok', details }
}
