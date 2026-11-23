// Builds the Sample_Files data/samples/<slug>.json from the export data/sample-paths.json
// (spec: sample-path, Requirement 2, criteria 8 to 10).
// Run from the project root: yarn samples   (or: node scripts/build-sample-paths.mjs)
//
// The export is a list of { slug, sample }, where `sample` is the path as a JSON string. It is
// refreshed by the owner when more videos are available, so this script runs again at any time:
//
//   1. Replace data/sample-paths.json with the new export.
//   2. yarn samples
//   3. yarn test   (sample-files.test.ts checks the content of every Sample_File)
//
// The script checks the shape of the export only. It writes nothing when any entry is broken,
// writes the same bytes for the same input (fixed key order, 2 space indent, final newline), and
// leaves the file of a slug that the export does not hold untouched, with a warning.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'data/sample-paths.json')
const TARGET_DIR = join(ROOT, 'data/samples')

/** Must equal SAMPLE_SLUGS in shared/utils/sample-slugs.ts; sample-files.test.ts checks it. */
export const SLUGS = ['photography', 'guitar', 'birdwatching']

const PATH_KEYS = ['slug', 'hobby', 'mascot', 'finish', 'sections']
const SECTION_KEYS = ['level', 'name', 'skills']
const SKILL_KEYS = ['id', 'title', 'desc', 'milestone', 'quests', 'videos']
const VIDEO_KEYS = ['id', 'title', 'channel', 'durationSeconds', 'thumbnailUrl']

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The record with the known keys first, in order, then any other key in its own order. Unknown
 * keys are kept, so the strict schema of the test reports them instead of them vanishing here.
 */
function ordered(value, keys, inner = {}) {
  if (!isRecord(value)) return value
  const out = {}
  for (const key of keys) if (Object.hasOwn(value, key)) out[key] = inner[key] ? inner[key](value[key]) : value[key]
  for (const key of Object.keys(value)) if (!keys.includes(key)) out[key] = value[key]
  return out
}

const list = (fn) => (value) => (Array.isArray(value) ? value.map(fn) : value)
const orderVideo = (video) => ordered(video, VIDEO_KEYS)
const orderSkill = (skill) => ordered(skill, SKILL_KEYS, { videos: list(orderVideo) })
const orderSection = (section) => ordered(section, SECTION_KEYS, { skills: list(orderSkill) })
const orderPath = (path) => ordered(path, PATH_KEYS, { sections: list(orderSection) })

/**
 * Pure conversion: the parsed export to the text of each Sample_File.
 * Returns `errors` (nothing may be written when not empty), `files` (slug → text) and
 * `missing` (slugs the export does not hold).
 */
export function convertExport(exported) {
  const errors = []
  const files = {}
  if (!Array.isArray(exported)) {
    return { errors: ['the export is not a list of { slug, sample }'], files, missing: [] }
  }
  exported.forEach((entry, index) => {
    const where = `entry ${index + 1}`
    if (!isRecord(entry)) return errors.push(`${where}: not an object`)
    const { slug, sample } = entry
    if (typeof slug !== 'string' || !SLUGS.includes(slug)) {
      return errors.push(`${where}: slug ${JSON.stringify(slug)} is not one of ${SLUGS.join(', ')}`)
    }
    if (Object.hasOwn(files, slug)) return errors.push(`${where}: slug "${slug}" is listed twice`)
    if (typeof sample !== 'string') return errors.push(`${slug}: "sample" is not a JSON string`)
    let path
    try {
      path = JSON.parse(sample)
    } catch (error) {
      return errors.push(`${slug}: "sample" is not valid JSON (${error instanceof Error ? error.message : 'parse error'})`)
    }
    if (!isRecord(path)) return errors.push(`${slug}: "sample" is not an object`)
    if (path.slug !== slug) return errors.push(`${slug}: "sample" has slug ${JSON.stringify(path.slug)}`)
    files[slug] = `${JSON.stringify(orderPath(path), null, 2)}\n`
  })
  const missing = SLUGS.filter((slug) => !Object.hasOwn(files, slug))
  return { errors, files, missing }
}

function main() {
  let exported
  try {
    exported = JSON.parse(readFileSync(SOURCE, 'utf8'))
  } catch (error) {
    console.error(`Cannot read ${SOURCE}: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
  const { errors, files, missing } = convertExport(exported)
  if (errors.length > 0) {
    console.error('Nothing was written. Fix the export:')
    for (const error of errors) console.error(`  - ${error}`)
    process.exit(1)
  }
  mkdirSync(TARGET_DIR, { recursive: true })
  for (const [slug, text] of Object.entries(files)) {
    const target = join(TARGET_DIR, `${slug}.json`)
    let before = null
    try {
      before = readFileSync(target, 'utf8')
    } catch {
      // A new file.
    }
    if (before === text) {
      console.log(`unchanged  data/samples/${slug}.json`)
      continue
    }
    writeFileSync(target, text)
    console.log(`${before === null ? 'written   ' : 'updated   '} data/samples/${slug}.json`)
  }
  for (const slug of missing) console.warn(`warning    the export has no "${slug}"; data/samples/${slug}.json was left as it is`)
  console.log('Next: yarn test')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
