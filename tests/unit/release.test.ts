import { describe, expect, it } from 'vitest'
// @ts-expect-error plain JS module without types
import { bumpVersion, detectBump, releaseChangelog } from '../../scripts/release.mjs'

const changelog = `# Changelog

## [Unreleased]

### Added

- New thing.

### Changed

### Fixed

- A bug.

## [0.1.0] - 2026-11-13

### Added

- First thing.
`

describe('release script', () => {
  it('moves unreleased entries under the new version and drops empty groups', () => {
    expect(releaseChangelog(changelog, '0.2.0', '2026-11-14')).toBe(`# Changelog

## [Unreleased]

## [0.2.0] - 2026-11-14

### Added

- New thing.

### Fixed

- A bug.

## [0.1.0] - 2026-11-13

### Added

- First thing.
`)
  })

  it('returns null when nothing is unreleased', () => {
    expect(releaseChangelog('# Changelog\n\n## [Unreleased]\n\n### Added\n\n## [0.1.0]\n', '0.2.0', 'x')).toBeNull()
  })

  it('picks the bump level from the entries', () => {
    expect(detectBump('\n### Added\n\n- x\n')).toBe('minor')
    expect(detectBump('\n### Added\n\n### Fixed\n\n- x\n')).toBe('patch')
    expect(detectBump('\n### Changed\n\n- BREAKING: x\n')).toBe('major')
  })

  it('bumps semver parts', () => {
    expect(bumpVersion('0.1.3', 'patch')).toBe('0.1.4')
    expect(bumpVersion('0.1.3', 'minor')).toBe('0.2.0')
    expect(bumpVersion('0.1.3', 'major')).toBe('1.0.0')
  })
})
