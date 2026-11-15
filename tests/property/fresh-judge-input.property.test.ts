import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { normalizeText } from '../../shared/utils/video-normalize'
import { buildFreshJudgeInput, SKILL_TITLES_MAX } from '../../server/utils/fresh/fresh-judge'
import { DESCRIPTION_MAX_CHARS, truncateDescription } from '../../server/utils/video/judge'
import type { VideoDetails } from '../../server/utils/video/provider'

const RUNS = { numRuns: 300 }

interface SentVideo {
  video_id: string
  title: string
  description: string
  channel: string
  duration_seconds: number | null
}

interface Payload {
  hobby: string
  language: string
  skill_titles: string[]
  videos: SentVideo[]
}

/** Words from a small pool so duplicate titles (after normalizing) are common. */
const arbWord = fc.constantFrom('crimp', 'Crimp', 'heel hook', 'Flagging!', 'drop-knee', 'smear', 'mantle', 'ñandú', '攀岩', '🧗')
const arbTitle = fc.oneof(
  { weight: 4, arbitrary: fc.array(arbWord, { minLength: 1, maxLength: 3 }).map(w => w.join(' ')) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 200 }).map(n => `skill ${n}`) },
  { weight: 1, arbitrary: fc.constantFrom('', '   ', '!!!', '...') },
)
/** 1 to 90 titles with at least one that is non-empty after normalizing. */
const arbTitles = fc
  .tuple(fc.array(arbTitle, { maxLength: 89 }), arbTitle.filter(t => normalizeText(t) !== ''), fc.nat())
  .map(([rest, good, at]) => {
    const out = [...rest]
    out.splice(at % (rest.length + 1), 0, good)
    return out
  })

/** Descriptions around the 500-character limit, including astral characters and empty ones. */
const arbDescription = fc.oneof(
  fc.constant(''),
  fc.string({ maxLength: 40 }),
  fc.integer({ min: DESCRIPTION_MAX_CHARS - 3, max: DESCRIPTION_MAX_CHARS + 3 })
    .chain(n => fc.constantFrom('a', 'é', '🎸').map(c => c.repeat(n))),
  fc.string({ unit: 'grapheme', minLength: 400, maxLength: 700 }),
)

const arbVideo: fc.Arbitrary<VideoDetails> = fc.record({
  id: fc.stringMatching(/^[A-Za-z0-9_-]{11}$/),
  title: fc.string({ maxLength: 60 }),
  channel: fc.string({ maxLength: 30 }),
  channelId: fc.option(fc.string({ maxLength: 24 }), { nil: null }),
  description: arbDescription,
  thumbnailUrl: fc.constant('https://i.ytimg.com/vi/x/hqdefault.jpg'),
  durationSeconds: fc.option(fc.integer({ min: 0, max: 36_000 }), { nil: null }),
  viewCount: fc.option(fc.nat(), { nil: null }),
  likeCount: fc.option(fc.nat(), { nil: null }),
  publishedAt: fc.option(fc.constant('2026-11-10T10:00:00Z'), { nil: null }),
  defaultAudioLanguage: fc.option(fc.constantFrom('en', 'tr', 'de'), { nil: null }),
  hasCaptions: fc.option(fc.boolean(), { nil: null }),
  embeddable: fc.option(fc.boolean(), { nil: null }),
})

/** A Check_Key hobby is already Normalized. */
const arbHobby = fc.string({ minLength: 1, maxLength: 30 }).map(normalizeText).filter(h => h !== '')
const arbLanguage = fc.constantFrom('en', 'tr', 'de', 'ja', 'und')

/** Expected title list: Normalized, empty dropped, first occurrence kept, given order, at most 60. */
function expectedTitles(titles: readonly string[]): string[] {
  const out: string[] = []
  for (const t of titles) {
    const n = normalizeText(t)
    if (n !== '' && !out.includes(n)) out.push(n)
  }
  return out.slice(0, SKILL_TITLES_MAX)
}

// Feature: fresh, Property 19: Judge input
describe('Feature: fresh, Property 19: Judge input', () => {
  /** **Validates: Requirements 6.2** */
  it('carries the hobby, language, 1 to 60 distinct titles in order and every video with a capped description', () => {
    fc.assert(
      fc.property(
        arbHobby,
        arbLanguage,
        arbTitles,
        fc.array(arbVideo, { maxLength: 40 }),
        (hobby, language, skillTitles, videos) => {
          const payload = JSON.parse(buildFreshJudgeInput({ hobby, language, skillTitles }, videos)) as Payload

          expect(payload.hobby).toBe(hobby)
          expect(payload.language).toBe(language)

          const titles = payload.skill_titles
          expect(titles.length).toBeGreaterThanOrEqual(1)
          expect(titles.length).toBeLessThanOrEqual(SKILL_TITLES_MAX)
          expect(new Set(titles).size).toBe(titles.length)
          for (const t of titles) expect(normalizeText(t)).toBe(t)
          expect(titles).toEqual(expectedTitles(skillTitles))

          expect(payload.videos).toHaveLength(videos.length)
          payload.videos.forEach((sent, i) => {
            const v = videos[i]!
            expect(sent.video_id).toBe(v.id)
            expect(sent.title).toBe(v.title)
            expect(sent.channel).toBe(v.channel)
            expect(sent.duration_seconds).toBe(v.durationSeconds)
            const chars = Array.from(v.description)
            expect(Array.from(sent.description).length).toBeLessThanOrEqual(DESCRIPTION_MAX_CHARS)
            if (chars.length <= DESCRIPTION_MAX_CHARS) expect(sent.description).toBe(v.description)
            else expect(sent.description).toBe(chars.slice(0, DESCRIPTION_MAX_CHARS).join(''))
            expect(sent.description).toBe(truncateDescription(v.description))
          })
        },
      ),
      RUNS,
    )
  })

  it('sends an empty description when the video has none', () => {
    fc.assert(
      fc.property(arbVideo, (v) => {
        const payload = JSON.parse(
          buildFreshJudgeInput({ hobby: 'bouldering', language: 'en', skillTitles: ['crimp'] }, [{ ...v, description: '' }]),
        ) as Payload
        expect(payload.videos[0]!.description).toBe('')
      }),
      { numRuns: 50 },
    )
  })
})
