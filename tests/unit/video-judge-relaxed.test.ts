import { describe, expect, it } from 'vitest'
import { applyVerdicts } from '../../server/utils/video/judge'
import { EMPTY_POOL_EXPIRY_SECONDS, POOL_EXPIRY_SECONDS, isStale } from '../../server/utils/video/pool'
import type { VideoDetails } from '../../server/utils/video/provider'

function candidate(id: string): VideoDetails {
  return {
    id,
    title: id,
    channel: 'c',
    description: '',
    thumbnailUrl: null,
    durationSeconds: 300,
    viewCount: null,
    likeCount: null,
    publishedAt: null,
    defaultAudioLanguage: null,
    hasCaptions: null,
    embeddable: true,
  } as VideoDetails
}

function verdict(id: string, teaches: number, isInstruction = true) {
  return {
    video_id: id,
    teaches_this_skill: teaches,
    level_fit: 0.5,
    is_instruction: isInstruction,
    style: 'technique' as const,
    best_matching_quest_text: null,
  }
}

describe('applyVerdicts relaxed pass', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  const candidates = ids.map(candidate)

  it('keeps only videos at or above 0.5 when any reach it', () => {
    const out = applyVerdicts({ verdicts: [verdict('a', 0.6), verdict('b', 0.4)] }, candidates, [])
    expect(out.ok && out.kept.map((v) => v.id)).toEqual(['a'])
  })

  it('keeps the best 3 instructional videos at or above 0.3 when none reach 0.5', () => {
    const out = applyVerdicts(
      {
        verdicts: [
          verdict('a', 0.3),
          verdict('b', 0.45),
          verdict('c', 0.2),
          verdict('d', 0.4),
          verdict('e', 0.49, false),
        ],
      },
      candidates,
      [],
    )
    expect(out.ok && out.kept.map((v) => v.id)).toEqual(['b', 'd', 'a'])
  })

  it('keeps nothing when every video is below 0.3 or not instruction', () => {
    const out = applyVerdicts({ verdicts: [verdict('a', 0.2), verdict('b', 0.9, false)] }, candidates, [])
    expect(out.ok && out.kept).toEqual([])
  })
})

describe('isStale', () => {
  it('expires an empty pool after 1 day and a filled pool after 7 days', () => {
    expect(isStale(EMPTY_POOL_EXPIRY_SECONDS - 1, 0)).toBe(false)
    expect(isStale(EMPTY_POOL_EXPIRY_SECONDS, 0)).toBe(true)
    expect(isStale(EMPTY_POOL_EXPIRY_SECONDS, 4)).toBe(false)
    expect(isStale(POOL_EXPIRY_SECONDS, 4)).toBe(true)
  })
})
