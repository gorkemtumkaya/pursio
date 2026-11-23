// Route decision of /try/<hobby> (spec: sample-path, Requirement 1). Takes the slug and the
// query only: no session, account or stored state can change it (Req 1.8).
import { isSampleSlug, unknownSlugTarget } from '#shared/utils/sample-slugs'
import { getSample } from '~/utils/sample-paths'

/**
 * Null when the slug is a Sample_Slug whose file loads: the sample page shows. Otherwise the
 * `/new` target of Req 1.2, with the hobby prefilled when the slug gives one.
 */
export function sampleRedirect(
  slug: string,
  query: Readonly<Record<string, unknown>>,
): { path: '/new'; query: Record<string, string> } | null {
  if (isSampleSlug(slug) && getSample(slug) !== null) return null
  return unknownSlugTarget(slug, query)
}
