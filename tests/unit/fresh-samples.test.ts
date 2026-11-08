import { describe, expect, it } from 'vitest'
import { FRESH_FALLBACK, FRESH_SAMPLES, freshFor, freshMeta } from '~/utils/fresh-samples'

const SAMPLE_IDS = [
  'gear-basics',
  'reading-grades',
  'falling-safely',
  'warm-up-routine',
  'footwork-basics',
  'body-positioning',
  'resting-on-the-wall',
  'first-v2',
  'flagging',
  'heel-hooks',
  'toe-hooks',
  'reading-a-route',
  'first-v4',
]

describe('fresh samples', () => {
  it('has entries for exactly the 13 Sample_Tree node ids', () => {
    expect(Object.keys(FRESH_SAMPLES).sort()).toEqual([...SAMPLE_IDS].sort())
    for (const id of SAMPLE_IDS) expect(freshFor(id).length).toBeGreaterThan(0)
  })

  it('uses the reference entries for Footwork basics', () => {
    const titles = freshFor('footwork-basics').map((item) => item.title)
    expect(titles).toEqual([
      'The silent feet drill',
      'Why your feet keep slipping',
      'Edging vs smearing, explained',
    ])
  })

  it('returns the fallback list for unknown ids, including prototype keys', () => {
    expect(freshFor('unknown-node')).toBe(FRESH_FALLBACK)
    expect(freshFor('toString')).toBe(FRESH_FALLBACK)
    expect(FRESH_FALLBACK.length).toBeGreaterThan(0)
  })

  it('formats the meta line like the reference design', () => {
    const [first, second] = freshFor('footwork-basics')
    expect(freshMeta(first!)).toBe('Video · 8 min')
    expect(freshMeta(second!)).toBe('Article · 5 min read')
  })
})
