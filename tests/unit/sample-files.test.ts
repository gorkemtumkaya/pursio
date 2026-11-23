// The Sample_Files and their converter (spec: sample-path, Requirement 2, task 2.3).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { SamplePath, SampleSlug } from '../../shared/types/sample-path'
import { parseSamplePath, sampleCounts } from '../../shared/utils/sample-path'
import { SAMPLE_SLUGS } from '../../shared/utils/sample-slugs'
import { getSample } from '../../app/utils/sample-paths'
// @ts-expect-error: a plain .mjs script without type declarations
import { SLUGS as SCRIPT_SLUGS, convertExport } from '../../scripts/build-sample-paths.mjs'

const ROOT = new URL('../../', import.meta.url)

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8')) as unknown
}

function readText(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, ROOT)), 'utf8')
}

/** Dash_Character of Requirement 13. */
const DASH = /[-‐-―−﹘﹣－]/

function pathText(sample: SamplePath): string[] {
  return [
    sample.hobby,
    sample.finish,
    ...sample.sections.flatMap((section) => [
      section.name,
      ...section.skills.flatMap((skill) => [skill.title, skill.desc, ...skill.quests]),
    ]),
  ]
}

type Convert = (exported: unknown) => { errors: string[]; files: Record<string, string>; missing: string[] }
const convert = convertExport as Convert

/** A small valid Sample, as a plain object, for the negative cases. */
function minimal(slug: SampleSlug = 'guitar'): Record<string, unknown> {
  return {
    slug,
    hobby: 'Guitar',
    mascot: 'guitar',
    finish: 'Play one song',
    sections: [
      {
        level: 'beginner',
        name: 'First chords',
        skills: [
          { id: 'open-chords', title: 'Open chords', desc: 'Three shapes.', milestone: false, quests: ['A', 'B', 'C'], videos: [] },
          {
            id: 'first-song',
            title: 'First song',
            desc: 'Put them together.',
            milestone: true,
            quests: ['A', 'B', 'C'],
            videos: [{ id: 'abcdefghijk', title: 'A video', channel: 'A channel', durationSeconds: 300, thumbnailUrl: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg' }],
          },
        ],
      },
    ],
  }
}

describe('the three Sample_Files', () => {
  it.each(SAMPLE_SLUGS)('%s passes every check and its slug is its file name', (slug) => {
    const result = parseSamplePath(readJson(`data/samples/${slug}.json`), slug)
    if (!result.ok) throw new Error(result.errors.join('\n'))
    expect(result.value.slug).toBe(slug)
    expect(getSample(slug)).toEqual(result.value)
  })

  it.each(SAMPLE_SLUGS)('%s has no dash character in its path text (Req 13.2)', (slug) => {
    const sample = getSample(slug)
    if (!sample) throw new Error(`${slug} did not load`)
    expect(pathText(sample).filter((text) => DASH.test(text))).toEqual([])
  })

  it('counts come from the data: the supplied files differ in size (Req 2.5)', () => {
    const counts = SAMPLE_SLUGS.map((slug) => {
      const sample = getSample(slug)
      if (!sample) throw new Error(`${slug} did not load`)
      return sampleCounts(sample)
    })
    expect(counts).toEqual([
      { skills: 14, sections: 3 },
      { skills: 9, sections: 2 },
      { skills: 13, sections: 2 },
    ])
  })

  it('getSample is null for any other slug', () => {
    expect(getSample('calligraphy')).toBeNull()
    expect(getSample('Guitar')).toBeNull()
    expect(getSample('')).toBeNull()
  })
})

describe('parseSamplePath rejects broken files (Req 2.3)', () => {
  function errorsOf(edit: (value: Record<string, unknown>) => void, slug: SampleSlug = 'guitar'): string[] {
    const value = minimal()
    edit(value)
    const result = parseSamplePath(value, slug)
    return result.ok ? [] : result.errors
  }
  const firstSkill = (value: Record<string, unknown>): Record<string, unknown> =>
    ((value.sections as Record<string, unknown>[])[0]!.skills as Record<string, unknown>[])[0]!

  it('accepts the minimal file, with an empty videos list', () => {
    expect(parseSamplePath(minimal(), 'guitar').ok).toBe(true)
  })

  it('rejects a slug that is not the file name', () => {
    expect(errorsOf(() => {}, 'photography')).toEqual(['slug: is "guitar", expected "photography"'])
  })

  it('rejects a repeated skill id', () => {
    expect(errorsOf((v) => { firstSkill(v).id = 'first-song' })).toEqual(['skills: id "first-song" is used twice'])
  })

  it('rejects 2 quests, an empty title, an unknown key, a bad video id, a non https thumbnail and a level outside the list', () => {
    expect(errorsOf((v) => { firstSkill(v).quests = ['A', 'B'] })).not.toEqual([])
    expect(errorsOf((v) => { firstSkill(v).title = '   ' })).not.toEqual([])
    expect(errorsOf((v) => { firstSkill(v).extra = true })).not.toEqual([])
    expect(errorsOf((v) => { firstSkill(v).videos = [{ id: 'short', title: 'T', channel: 'C', durationSeconds: 1, thumbnailUrl: 'https://i.ytimg.com/x' }] })).not.toEqual([])
    expect(errorsOf((v) => { firstSkill(v).videos = [{ id: 'abcdefghijk', title: 'T', channel: 'C', durationSeconds: 1, thumbnailUrl: 'http://example.com/x.jpg' }] })).not.toEqual([])
    expect(errorsOf((v) => { (v.sections as Record<string, unknown>[])[0]!.level = 'expert' })).not.toEqual([])
  })

  it('rejects a section without skills and a file without sections', () => {
    expect(errorsOf((v) => { (v.sections as Record<string, unknown>[])[0]!.skills = [] })).not.toEqual([])
    expect(errorsOf((v) => { v.sections = [] })).not.toEqual([])
  })
})

describe('the converter script (Req 2.8, 2.9)', () => {
  it('knows the same slugs as the app', () => {
    expect(SCRIPT_SLUGS).toEqual([...SAMPLE_SLUGS])
  })

  it('the committed Sample_Files are exactly what the script makes from the committed export', () => {
    const result = convert(readJson('data/sample-paths.json'))
    expect(result.errors).toEqual([])
    expect(result.missing).toEqual([])
    for (const slug of SAMPLE_SLUGS) expect(result.files[slug]).toBe(readText(`data/samples/${slug}.json`))
  })

  it('gives the same text for the same input, with keys in the order of Requirement 2.1', () => {
    const scrambled = { sections: minimal().sections, finish: 'Play one song', slug: 'guitar', mascot: 'guitar', hobby: 'Guitar' }
    const once = convert([{ slug: 'guitar', sample: JSON.stringify(scrambled) }])
    const twice = convert([{ slug: 'guitar', sample: JSON.stringify(JSON.parse(once.files.guitar ?? '{}')) }])
    expect(once.files.guitar).toBe(twice.files.guitar)
    expect(Object.keys(JSON.parse(once.files.guitar ?? '{}') as object)).toEqual(['slug', 'hobby', 'mascot', 'finish', 'sections'])
    expect(once.files.guitar?.endsWith('}\n')).toBe(true)
  })

  it('keeps unknown keys, so the schema test reports them instead of the script hiding them', () => {
    const result = convert([{ slug: 'guitar', sample: JSON.stringify({ ...minimal(), note: 'x' }) }])
    expect(Object.keys(JSON.parse(result.files.guitar ?? '{}') as object)).toContain('note')
  })

  it('reports every broken entry and gives no file to write for them', () => {
    const result = convert([
      { slug: 'guitar', sample: '{ not json' },
      { slug: 'calligraphy', sample: JSON.stringify(minimal()) },
      { slug: 'photography', sample: JSON.stringify(minimal('guitar')) },
      { slug: 'birdwatching', sample: JSON.stringify(minimal('birdwatching')) },
      { slug: 'birdwatching', sample: JSON.stringify(minimal('birdwatching')) },
    ])
    expect(result.errors).toHaveLength(4)
    expect(result.errors.join('\n')).toMatch(/guitar: "sample" is not valid JSON/)
    expect(result.errors.join('\n')).toMatch(/"calligraphy" is not one of/)
    expect(result.errors.join('\n')).toMatch(/photography: "sample" has slug "guitar"/)
    expect(result.errors.join('\n')).toMatch(/"birdwatching" is listed twice/)
  })

  it('names the slugs the export does not hold', () => {
    const result = convert([{ slug: 'guitar', sample: JSON.stringify(minimal()) }])
    expect(result.errors).toEqual([])
    expect(result.missing).toEqual(['photography', 'birdwatching'])
  })

  it('rejects an export that is not a list', () => {
    expect(convert({ slug: 'guitar' }).errors).toEqual(['the export is not a list of { slug, sample }'])
  })
})
