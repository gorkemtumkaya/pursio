import { describe, expect, it } from 'vitest'
import { applyFreshVerdicts, quotesSource } from '../../server/utils/fresh/fresh-judge'
import { fakeDetails } from '../support/video-fakes'

// Req 19.6: the verdict drop rules of Req 6.7 to 6.9.

const TITLES = ['footwork', 'flagging']

const TITLE = 'Silent feet drill for cleaner bouldering footwork'
const DESCRIPTION = 'In this session we practice placing each toe quietly on small holds before moving up the wall'

function sent(id = 'v1') {
  return [fakeDetails(id, { title: TITLE, description: DESCRIPTION })]
}

function verdict(overrides: Record<string, unknown> = {}) {
  return {
    video_id: 'v1',
    skill_title: 'footwork',
    level: 'beginner',
    teaches_this_skill: 0.8,
    level_fit: 0.7,
    is_instruction: true,
    style: 'drill',
    why: 'Teaches you to place your feet without a sound.',
    ...overrides,
  }
}

function keptIds(overrides: Record<string, unknown> = {}): string[] {
  const out = applyFreshVerdicts({ verdicts: [verdict(overrides)] }, sent(), TITLES)
  expect(out.ok).toBe(true)
  return out.ok ? out.kept.map(k => k.video.id) : []
}

describe('applyFreshVerdicts drops', () => {
  it('keeps a valid baseline verdict', () => {
    expect(keptIds()).toEqual(['v1'])
  })

  it('drops a video with is_instruction false', () => {
    expect(keptIds({ is_instruction: false })).toEqual([])
  })

  it('drops a video with teaches_this_skill 0.49', () => {
    expect(keptIds({ teaches_this_skill: 0.49 })).toEqual([])
  })

  it('keeps a video with teaches_this_skill exactly 0.5', () => {
    expect(keptIds({ teaches_this_skill: 0.5 })).toEqual(['v1'])
  })

  it('drops a video with a null skill_title', () => {
    expect(keptIds({ skill_title: null })).toEqual([])
  })

  it('drops a video whose skill_title is not among the given titles', () => {
    expect(keptIds({ skill_title: 'heel hooks' })).toEqual([])
  })

  it('keeps a skill_title that matches after Normalization and stores the given title', () => {
    const out = applyFreshVerdicts({ verdicts: [verdict({ skill_title: '  FootWork ' })] }, sent(), TITLES)
    expect(out.ok && out.kept.map(k => k.skillTitle)).toEqual(['footwork'])
  })

  it('drops a why copying 6 consecutive words of the title', () => {
    expect(keptIds({ why: 'A silent feet drill for cleaner bouldering session.' })).toEqual([])
  })

  it('drops a why copying 6 consecutive words of the description', () => {
    expect(keptIds({ why: 'You learn placing each toe quietly on small holds.' })).toEqual([])
  })

  it('keeps a why sharing only 5 consecutive words of the title', () => {
    expect(keptIds({ why: 'Silent feet drill for cleaner climbing.' })).toEqual(['v1'])
  })

  it('keeps a why sharing only 5 consecutive words of the description', () => {
    expect(keptIds({ why: 'You learn placing each toe quietly on ledges.' })).toEqual(['v1'])
  })
})

describe('quotesSource', () => {
  it('is true at 6 copied words and false at 5', () => {
    expect(quotesSource('one two three four five six', 'one two three four five six seven', '')).toBe(true)
    expect(quotesSource('one two three four five other', 'one two three four five six seven', '')).toBe(false)
  })

  it('compares after Normalization', () => {
    expect(quotesSource('ONE, two three  Four five SIX', 'one two three four five six', '')).toBe(true)
  })
})
