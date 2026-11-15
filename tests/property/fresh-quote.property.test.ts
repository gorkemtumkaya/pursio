import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { QUOTE_WORDS, quotesSource } from '../../server/utils/fresh/fresh-judge'
import { normalizeText } from '../../shared/utils/video-normalize'

const RUNS = { numRuns: 300 }

/** Words the title and description are made of. */
const SOURCE_WORDS = ['grip', 'chalk', 'crimp', 'heel', 'hook', 'flag', 'smear', 'edge', 'pinch', 'sloper']
/** Words an unrelated why is made of; none is a source word. */
const OTHER_WORDS = ['sunny', 'river', 'quiet', 'table', 'yellow', 'violin', 'garden', 'paper']
/** Separators that Normalization collapses to one space. */
const SEPARATORS = [' ', '  ', '\t', '\n', ', ', '. ', ' - ', '! ', ' (', ') ']

const arbSeparator = fc.constantFrom(...SEPARATORS)

/** One word with random case and optional punctuation at its edges. */
function noisy(word: string): fc.Arbitrary<string> {
  return fc.record({
    upper: fc.array(fc.boolean(), { minLength: word.length, maxLength: word.length }),
    before: fc.constantFrom('', '"', '\'', '('),
    after: fc.constantFrom('', ',', '.', '!', '?', ':', '"', ')'),
  }).map(({ upper, before, after }) =>
    before + Array.from(word, (c, i) => (upper[i] ? c.toUpperCase() : c)).join('') + after,
  )
}

/** Joins words into text with random case, punctuation and whitespace. */
function noisyText(words: readonly string[]): fc.Arbitrary<string> {
  if (words.length === 0) return fc.constantFrom('', ' ', '\n')
  return fc.tuple(
    fc.tuple(...words.map(noisy)),
    fc.array(arbSeparator, { minLength: words.length + 1, maxLength: words.length + 1 }),
  ).map(([ws, seps]) => {
    let out = seps[0]!
    ws.forEach((w, i) => { out += w + seps[i + 1] })
    return out
  })
}

function normWords(text: string): string[] {
  const n = normalizeText(text)
  return n === '' ? [] : n.split(' ')
}

/** Longest run of consecutive words of `a` that also appears in order in `b`. */
function longestSharedRun(a: readonly string[], b: readonly string[]): number {
  let best = 0
  const prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    let diag = 0
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0
      if (prev[j]! > best) best = prev[j]!
      diag = up
    }
  }
  return best
}

describe('Feature: fresh, Property 21: Quote check', () => {
  // **Validates: Requirements 6.9**
  it('a run of k source words in an unrelated why is a quote exactly when k >= 6', () => {
    const arbCase = fc.record({
      title: fc.array(fc.constantFrom(...SOURCE_WORDS), { maxLength: 14 }),
      description: fc.array(fc.constantFrom(...SOURCE_WORDS), { maxLength: 40 }),
      fromTitle: fc.boolean(),
      k: fc.integer({ min: 0, max: 10 }),
      start: fc.nat(),
      before: fc.array(fc.constantFrom(...OTHER_WORDS), { maxLength: 6 }),
      after: fc.array(fc.constantFrom(...OTHER_WORDS), { maxLength: 6 }),
    }).filter(c => (c.fromTitle ? c.title : c.description).length >= c.k)
      .chain((c) => {
        const src = c.fromTitle ? c.title : c.description
        const from = c.k === 0 ? 0 : c.start % (src.length - c.k + 1)
        const run = src.slice(from, from + c.k)
        const whyWords = [...c.before, ...run, ...c.after]
        return fc.record({
          k: fc.constant(c.k),
          why: noisyText(whyWords),
          title: noisyText(c.title),
          description: noisyText(c.description),
        })
      })

    fc.assert(
      fc.property(arbCase, ({ k, why, title, description }) => {
        expect(quotesSource(why, title, description)).toBe(k >= QUOTE_WORDS)
      }),
      RUNS,
    )
  })

  // **Validates: Requirements 6.9**
  it('is true only when a Normalized run of 6 or more words is shared with the title or description', () => {
    const vocab = ['grip', 'chalk', 'crimp']
    const arbWords = (max: number) => fc.array(fc.constantFrom(...vocab), { maxLength: max })
    const arbCase = fc.record({
      why: arbWords(16),
      title: arbWords(12),
      description: arbWords(24),
    }).chain(c => fc.record({
      why: noisyText(c.why),
      title: noisyText(c.title),
      description: noisyText(c.description),
    }))

    fc.assert(
      fc.property(arbCase, ({ why, title, description }) => {
        const w = normWords(why)
        const shared = Math.max(
          longestSharedRun(w, normWords(title)),
          longestSharedRun(w, normWords(description)),
        )
        expect(quotesSource(why, title, description)).toBe(shared >= QUOTE_WORDS)
      }),
      RUNS,
    )
  })

  it('uses a 6-word window', () => {
    expect(QUOTE_WORDS).toBe(6)
  })
})
