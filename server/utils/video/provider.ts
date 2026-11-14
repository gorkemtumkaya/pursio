/**
 * Generic video provider interface. Pipeline modules import this file only;
 * the single module that knows a concrete provider is `select-provider.ts`.
 */

export type ProviderErrorKind = 'not_configured' | 'quota_exceeded' | 'timeout' | 'upstream'

/** Carries the failure kind only: never a URL, header, key or response body. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind

  constructor(kind: ProviderErrorKind) {
    super(kind)
    this.name = 'ProviderError'
    this.kind = kind
  }
}

export interface SearchHit {
  id: string
  title: string
  channel: string
  thumbnailUrl: string
}

export interface VideoDetails {
  id: string
  title: string
  channel: string
  description: string
  thumbnailUrl: string
  /** null when unknown. */
  durationSeconds: number | null
  viewCount: number | null
  likeCount: number | null
  publishedAt: string | null
  defaultAudioLanguage: string | null
  hasCaptions: boolean | null
  embeddable: boolean | null
}

export interface VideoProvider {
  /** maxResults 1..50. `language` is a Language_Code or 'und'. */
  search(
    query: string,
    maxResults: number,
    opts: { language: string, signal?: AbortSignal },
  ): Promise<SearchHit[]>
  /** 1..50 ids. Ids the provider does not return are absent from the result. */
  getDetails(ids: readonly string[], opts: { signal?: AbortSignal }): Promise<VideoDetails[]>
}
