// The three Sample_Files, imported at build time (spec: sample-path, Req 2.2). No request loads a Sample.
import birdwatching from '~~/data/samples/birdwatching.json'
import guitar from '~~/data/samples/guitar.json'
import photography from '~~/data/samples/photography.json'
import type { SamplePath, SampleSlug } from '#shared/types/sample-path'
import { parseSamplePath } from '#shared/utils/sample-path'
import { isSampleSlug } from '#shared/utils/sample-slugs'

const FILES: Record<SampleSlug, unknown> = { photography, guitar, birdwatching }

const parsed = new Map<SampleSlug, SamplePath | null>()

/**
 * The checked Sample of a slug, or null for any other slug and for a file that fails its checks,
 * which the route then treats as unknown (Req 2.4). Each file is checked once per page load.
 */
export function getSample(slug: string): SamplePath | null {
  if (!isSampleSlug(slug)) return null
  if (!parsed.has(slug)) {
    const result = parseSamplePath(FILES[slug], slug)
    parsed.set(slug, result.ok ? result.value : null)
  }
  return parsed.get(slug) ?? null
}
