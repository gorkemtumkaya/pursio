import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  applyFreshVerdicts,
  freshJudgeOutputSchema,
  quotesSource,
  WHY_MAX,
} from '../../server/utils/fresh/fresh-judge'
import type { VideoDetails } from '../../server/utils/video/provider'
import { normalizeText } from '../../shared/utils/video-normalize'

const RUNS = { numRuns: 300 }

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const
const STYLES = ['drill', 'technique', 'explainer', 'approachable'] as const
/** Ids v0..v5 can be sent; v6 and v7 never are. */
const ALL_IDS = ['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7']
const SENDABLE = ALL_IDS.slice(0, 6)
/** Skill title words. */
const SKILL_WORDS = ['grip', 'footwork', 'heel hook', 'flagging', 'mantle', 'crimp']
/** Video text words, disjoint from the why vocabulary below. */
const VIDEO_WORDS = ['climb', 'wall', 'route', 'boulder', 'gym', 'send', 'project', 'chalk', 'beta']
/** Why words, never in video text, so a why only quotes when copy is forced. */
const WHY_WORDS = ['learn', 'steady', 'calm', 'better', 'moves', 'quickly', 'practice', 'clearer']

type Verdict = {
  video_id: string
  skill_title: string | null
  level: (typeof LEVELS)[number]
  teaches_this_skill: number
  level_fit: number
  is_instruction: boolean
  style: (typeof STYLES)[number]
  why: string
}

const arbText = (vocab: readonly string[], min: number, max: number): fc.Arbitrary<string> =>
  fc.array(fc.constantFrom(...vocab), { minLength: min, maxLength: max }).map(w => w.join(' '))

/** Case, punctuation and whitespace noise that Normalization removes. */
const arbNoisy = (s: string): fc.Arbitrary<string> =>
  fc.record({ upper: fc.boolean(), punct: fc.constantFrom('', '!', '.', '?'), pad: fc.constantFrom('', ' ', '  ') })
    .map(({ upper, punct, pad }) => `${pad}${upper ? s.toUpperCase() : s}${punct}${pad}`)

const arbVideo = (id: string): fc.Arbitrary<VideoDetails> =>
  fc.record({ title: arbText(VIDEO_WORDS, 1, 10), description: arbText(VIDEO_WORDS, 0, 30) }).map(t => ({
    id,
    title: t.title,
    channel: 'chan',
    channelId: null,
    description: t.description,
    thumbnailUrl: 'https://i.ytimg.com/vi/x/hq.jpg',
    durationSeconds: 300,
    viewCount: null,
    likeCount: null,
    publishedAt: null,
    defaultAudioLanguage: null,
    hasCaptions: null,
    embeddable: null,
  }))

/** Score straddling the 0.5 cutoff, with exact 0, 0.5 and 1. */
const arbScore = fc.oneof(
  fc.constantFrom(0, 0.49, 0.5, 0.51, 1),
  fc.double({ min: 0, max: 1, noNaN: true }),
)

/** A why that is valid for the schema; sometimes it copies 6+ words of the video title. */
const arbWhy = (video: VideoDetails | undefined): fc.Arbitrary<string> => {
  const own = arbText(WHY_WORDS, 1, 12).chain(arbNoisy)
  const titleWords = video ? normalizeText(video.title).split(' ') : []
  if (titleWords.length < 6) return own
  return fc.oneof(
    { weight: 3, arbitrary: own },
    {
      weight: 1,
      arbitrary: fc.tuple(arbText(WHY_WORDS, 0, 3), arbText(WHY_WORDS, 0, 3))
        .map(([a, b]) => `${a} ${titleWords.slice(0, 6).join(' ')} ${b}`.trim().slice(0, WHY_MAX)),
    },
  )
}

const arbVerdict = (id: string, video: VideoDetails | undefined, titles: readonly string[]): fc.Arbitrary<Verdict> =>
  fc.record({
    video_id: fc.constant(id),
    skill_title: fc.oneof(
      { weight: 4, arbitrary: fc.constantFrom(...titles).chain(arbNoisy) },
      { weight: 1, arbitrary: fc.constant('unknown skill') },
      { weight: 1, arbitrary: fc.constant(null) },
    ),
    level: fc.constantFrom(...LEVELS),
    teaches_this_skill: arbScore,
    level_fit: arbScore,
    is_instruction: fc.boolean(),
    style: fc.constantFrom(...STYLES),
    why: arbWhy(video),
  })

/** Sent videos, given Skill titles and a schema-valid response (omissions, duplicates and unsent ids allowed). */
const arbScene = fc.record({
  sentIds: fc.shuffledSubarray(SENDABLE, { minLength: 1 }),
  titles: fc.uniqueArray(fc.constantFrom(...SKILL_WORDS), { minLength: 1, maxLength: 4 }),
  verdictIds: fc.array(fc.constantFrom(...ALL_IDS), { maxLength: 10 }),
}).chain(({ sentIds, titles, verdictIds }) =>
  fc.tuple(...sentIds.map(arbVideo)).chain((sent) => {
    const byId = new Map(sent.map(v => [v.id, v]))
    return fc.record({
      sent: fc.constant(sent),
      titles: fc.tuple(...titles.map(arbNoisy)),
      verdicts: verdictIds.length === 0
        ? fc.constant([] as Verdict[])
        : fc.tuple(...verdictIds.map(id => arbVerdict(id, byId.get(id), titles))),
    })
  }),
)

/** One way to break the schema; each is listed in Req 6.5. */
type Breakage = (v: Record<string, unknown>) => void
const BREAKAGES: Breakage[] = [
  v => { delete v.video_id },
  v => { delete v.skill_title },
  v => { delete v.level },
  v => { delete v.teaches_this_skill },
  v => { delete v.level_fit },
  v => { delete v.is_instruction },
  v => { delete v.style },
  v => { delete v.why },
  v => { v.video_id = 7 },
  v => { v.skill_title = 3 },
  v => { v.is_instruction = 'true' },
  v => { v.teaches_this_skill = '0.9' },
  v => { v.teaches_this_skill = 1.01 },
  v => { v.teaches_this_skill = -0.01 },
  v => { v.level_fit = 2 },
  v => { v.level_fit = Number.NaN },
  v => { v.level = 'expert' },
  v => { v.style = 'vlog' },
  v => { v.why = '' },
  v => { v.why = '   \n\t ' },
  v => { v.why = ` ${'a'.repeat(WHY_MAX + 1)} ` },
  v => { v.why = null },
]

describe('fresh verdict handling', () => {
  // Feature: fresh, Property 20: Fresh verdict handling
  // **Validates: Requirements 6.4, 6.5, 6.7, 6.8, 6.10, 6.13**
  it('keeps exactly the videos the rules allow, with the given title and the verdict Level', () => {
    fc.assert(
      fc.property(arbScene, ({ sent, titles, verdicts }) => {
        expect(freshJudgeOutputSchema.safeParse({ verdicts }).success).toBe(true)
        const result = applyFreshVerdicts({ verdicts }, sent, titles)
        expect(result.ok).toBe(true)
        if (!result.ok) return

        const given = new Set(titles.map(normalizeText))
        const expected = sent.flatMap((video) => {
          const mine = verdicts.filter(v => v.video_id === video.id)
          if (mine.length !== 1) return []
          const v = mine[0]!
          if (!v.is_instruction || v.teaches_this_skill < 0.5 || v.skill_title === null) return []
          const title = normalizeText(v.skill_title)
          if (!given.has(title)) return []
          if (quotesSource(v.why.trim(), video.title, video.description)) return []
          return [{ id: video.id, skillTitle: title, level: v.level, why: v.why.trim() }]
        })

        expect(result.kept.map(k => ({ id: k.video.id, skillTitle: k.skillTitle, level: k.level, why: k.why })))
          .toEqual(expected)
        const sentIds = new Set(sent.map(v => v.id))
        for (const k of result.kept) {
          expect(sentIds.has(k.video.id)).toBe(true)
          expect(given.has(k.skillTitle)).toBe(true)
        }
      }),
      RUNS,
    )
  })

  // Feature: fresh, Property 20: Fresh verdict handling
  // **Validates: Requirements 6.4, 6.5**
  it('treats any schema violation as a model failure with no kept video', () => {
    const arbBroken = arbScene
      .filter(s => s.verdicts.length > 0)
      .chain(s => fc.record({
        scene: fc.constant(s),
        at: fc.nat({ max: s.verdicts.length - 1 }),
        breakIdx: fc.nat({ max: BREAKAGES.length - 1 }),
      }))
    fc.assert(
      fc.property(arbBroken, ({ scene, at, breakIdx }) => {
        const verdicts: Record<string, unknown>[] = scene.verdicts.map(v => ({ ...v }))
        BREAKAGES[breakIdx]!(verdicts[at]!)
        expect(applyFreshVerdicts({ verdicts }, scene.sent, scene.titles)).toEqual({ ok: false })
      }),
      RUNS,
    )
  })

  // Feature: fresh, Property 20: Fresh verdict handling
  // **Validates: Requirements 6.5**
  it('treats unparsable or wrongly shaped output as a model failure', () => {
    const arbBadOutput = fc.oneof(
      fc.constantFrom<unknown>(undefined, null, 'not json', '{"verdicts":[]}', 42, [], {}, { verdicts: {} }, { verdicts: null }),
      fc.anything().filter(x => !freshJudgeOutputSchema.safeParse(x).success),
    )
    fc.assert(
      fc.property(arbScene, arbBadOutput, ({ sent, titles }, output) => {
        expect(applyFreshVerdicts(output, sent, titles)).toEqual({ ok: false })
      }),
      RUNS,
    )
  })

  // Feature: fresh, Property 20: Fresh verdict handling
  // **Validates: Requirements 6.4**
  it('accepts a why of exactly 120 characters after trimming', () => {
    fc.assert(
      fc.property(arbScene.filter(s => s.verdicts.length > 0), fc.constantFrom('', ' ', '\n  '), (scene, pad) => {
        const verdicts = scene.verdicts.map(v => ({ ...v, why: `${pad}${'x'.repeat(WHY_MAX)}${pad}` }))
        expect(applyFreshVerdicts({ verdicts }, scene.sent, scene.titles).ok).toBe(true)
      }),
      RUNS,
    )
  })
})
