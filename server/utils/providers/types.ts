import type { ProviderConfig } from '../../../shared/types/llm'

export type AdapterFailure = 'provider_auth' | 'provider_error' | 'bad_output'
export type AdapterResult = { ok: true; value: unknown } | { ok: false; error: AdapterFailure }

export interface GenerateOptions {
  systemPrompt: string
  /** Extra user text for the retry call (Req 4.3). */
  retryNote?: string
  signal?: AbortSignal
}

export interface ProviderAdapter {
  generateTree(hobby: string, config: ProviderConfig, options: GenerateOptions): Promise<AdapterResult>
  /** One request with at most 16 output tokens (Req 12.3). */
  testConnection(config: ProviderConfig, signal?: AbortSignal): Promise<AdapterResult>
}

/** The subset of ofetch's $fetch the adapters use; tests pass a fake. */
export type Fetcher = (
  url: string,
  options: {
    method: 'POST'
    headers: Record<string, string>
    body: Record<string, unknown>
    signal?: AbortSignal
    retry: 0
  },
) => Promise<unknown>

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numericStatus(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/**
 * 401/403 → provider_auth; any other status, network or abort error → provider_error (Req 3.5, 3.6).
 * Only status fields are read, never the error body or message, which can echo part of the key.
 */
export function providerFailure(error: unknown): 'provider_auth' | 'provider_error' {
  if (!isRecord(error)) return 'provider_error'
  const response = error.response
  const statuses = [
    numericStatus(error.status),
    numericStatus(error.statusCode),
    isRecord(response) ? numericStatus(response.status) : undefined,
  ]
  return statuses.some((s) => s === 401 || s === 403) ? 'provider_auth' : 'provider_error'
}

/** Runs a fetch and maps thrown errors to an AdapterFailure. */
export async function callProvider(
  fetcher: Fetcher,
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<{ ok: true; response: unknown } | { ok: false; error: AdapterFailure }> {
  try {
    const response = await fetcher(url, { method: 'POST', headers, body, signal, retry: 0 })
    return { ok: true, response }
  } catch (error) {
    return { ok: false, error: providerFailure(error) }
  }
}
