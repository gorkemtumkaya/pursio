#!/usr/bin/env node
// Moves the [Unreleased] changelog entries into a new version section and
// bumps package.json to match. Run by the pre-commit hook in .githooks/, or by
// hand with `yarn release [major|minor|patch]`.
//
// Bump level, unless given as an argument or RELEASE_BUMP:
//   - "BREAKING" in an entry -> major
//   - an Added or Removed entry -> minor
//   - otherwise -> patch
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const UNRELEASED = /^## \[Unreleased\][^\n]*$/m
const NEXT_SECTION = /^## \[/m
const BUMPS = ['major', 'minor', 'patch']

/** Returns the body of the [Unreleased] section and where it sits, or null. */
export function findUnreleased(changelog) {
  const heading = UNRELEASED.exec(changelog)
  if (!heading) return null
  const start = heading.index + heading[0].length
  const rest = changelog.slice(start)
  const next = NEXT_SECTION.exec(rest)
  const end = next ? start + next.index : changelog.length
  return { headingStart: heading.index, start, end, body: changelog.slice(start, end) }
}

/** True when the section body has at least one list entry. */
export function hasEntries(body) {
  return /^\s*[-*] \S/m.test(body)
}

export function detectBump(body) {
  if (/BREAKING/.test(body)) return 'major'
  const groups = body.split(/^### /m).slice(1)
  const touched = groups.filter((g) => hasEntries(g)).map((g) => g.split('\n', 1)[0].trim())
  return touched.some((g) => g === 'Added' || g === 'Removed') ? 'minor' : 'patch'
}

export function bumpVersion(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
  if (!match) throw new Error(`Cannot bump version "${version}"`)
  let [major, minor, patch] = match.slice(1).map(Number)
  if (bump === 'major') [major, minor, patch] = [major + 1, 0, 0]
  else if (bump === 'minor') [minor, patch] = [minor + 1, 0]
  else if (bump === 'patch') patch += 1
  else throw new Error(`Unknown bump "${bump}"`)
  return `${major}.${minor}.${patch}`
}

/** Drops group headings (### Added, ...) that have no entries under them. */
function dropEmptyGroups(body) {
  const [head, ...groups] = body.split(/^(?=### )/m)
  return [head, ...groups.filter(hasEntries)].join('')
}

/**
 * Returns the changelog with the [Unreleased] entries moved under
 * `## [version] - date` and a fresh, empty [Unreleased] above it,
 * or null when there is nothing to release.
 */
export function releaseChangelog(changelog, version, date) {
  const section = findUnreleased(changelog)
  if (!section || !hasEntries(section.body)) return null
  const body = dropEmptyGroups(section.body).trim()
  const released = `## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n\n`
  return changelog.slice(0, section.headingStart) + released + changelog.slice(section.end).replace(/^\n+/, '')
}

function main() {
  const root = resolve(fileURLToPath(import.meta.url), '../..')
  const changelogPath = resolve(root, 'CHANGELOG.md')
  const pkgPath = resolve(root, 'package.json')

  const changelog = readFileSync(changelogPath, 'utf8')
  const section = findUnreleased(changelog)
  if (!section || !hasEntries(section.body)) {
    console.log('release: nothing under [Unreleased], skipping.')
    return
  }

  const requested = process.argv[2] || process.env.RELEASE_BUMP
  if (requested && !BUMPS.includes(requested)) {
    console.error(`release: bump must be one of ${BUMPS.join(', ')}, got "${requested}".`)
    process.exit(1)
  }
  const bump = requested || detectBump(section.body)

  const pkgText = readFileSync(pkgPath, 'utf8')
  const pkg = JSON.parse(pkgText)
  const version = bumpVersion(pkg.version, bump)
  const date = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local time

  writeFileSync(changelogPath, releaseChangelog(changelog, version, date))
  writeFileSync(pkgPath, pkgText.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`))
  console.log(`release: ${pkg.version} -> ${version} (${bump})`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
