/**
 * The one module that picks the active video provider.
 * It is the only importer of a concrete provider implementation.
 */
import type { VideoProvider } from './provider'
import { createYouTubeProvider } from './youtube-provider'

export interface SelectProviderOptions {
  apiKey: string
  fetcher?: typeof fetch
}

export function selectVideoProvider(options: SelectProviderOptions): VideoProvider {
  return createYouTubeProvider({ apiKey: options.apiKey, fetcher: options.fetcher })
}
