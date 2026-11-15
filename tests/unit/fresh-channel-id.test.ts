// Channel id carried through the skill pipeline (spec: fresh, task 1.2).
import { describe, expect, it } from 'vitest'
import type { PoolVideo, VideoPool } from '../../shared/types/video'
import { createYouTubeProvider } from '../../server/utils/video/youtube-provider'
import { applyVerdicts, DESCRIPTION_MAX_CHARS, truncateDescription } from '../../server/utils/video/judge'
import { composeVideos } from '../../server/utils/video/compose'
import { fakeDetails } from '../support/video-fakes'

function jsonFetcher(body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const signal = new AbortController().signal

describe('youtube provider channelId', () => {
  it('reads snippet.channelId on search hits, null when missing or empty', async () => {
    const provider = createYouTubeProvider({
      apiKey: 'k',
      fetcher: jsonFetcher({
        items: [
          { id: { videoId: 'a' }, snippet: { title: 'A', channelTitle: 'Ch', channelId: 'UCaaa' } },
          { id: { videoId: 'b' }, snippet: { title: 'B', channelTitle: 'Ch' } },
          { id: { videoId: 'c' }, snippet: { title: 'C', channelTitle: 'Ch', channelId: '' } },
        ],
      }),
    })
    const hits = await provider.search('q', 5, { language: 'en', signal })
    expect(hits.map((h) => h.channelId)).toEqual(['UCaaa', null, null])
  })

  it('reads snippet.channelId on details, null when missing', async () => {
    const provider = createYouTubeProvider({
      apiKey: 'k',
      fetcher: jsonFetcher({
        items: [
          { id: 'a', snippet: { channelId: 'UCaaa' } },
          { id: 'b', snippet: { channelId: 42 } },
        ],
      }),
    })
    const details = await provider.getDetails(['a', 'b'], { signal })
    expect(details.map((d) => d.channelId)).toEqual(['UCaaa', null])
  })
})

describe('judge channelId and truncateDescription', () => {
  it('copies channelId into the kept PoolVideo', () => {
    const result = applyVerdicts(
      {
        verdicts: [{
          video_id: 'v1',
          teaches_this_skill: 0.9,
          level_fit: 0.8,
          is_instruction: true,
          style: 'drill',
          best_matching_quest_text: null,
        }],
      },
      [fakeDetails('v1', { channelId: 'UCxyz' })],
      [],
    )
    expect(result.ok && result.kept[0]?.channelId).toBe('UCxyz')
  })

  it('cuts descriptions to 500 code points and keeps shorter text', () => {
    expect(truncateDescription('short')).toBe('short')
    const long = '😀'.repeat(DESCRIPTION_MAX_CHARS + 10)
    expect(Array.from(truncateDescription(long))).toHaveLength(DESCRIPTION_MAX_CHARS)
  })
})

describe('compose channelId', () => {
  function poolVideo(id: string, channelId: string | null | undefined): PoolVideo {
    const v: PoolVideo = {
      id,
      title: id,
      channel: 'Ch',
      channelId: null,
      thumbnailUrl: '',
      durationSeconds: 300,
      viewCount: null,
      likeCount: null,
      publishedAt: null,
      defaultAudioLanguage: null,
      hasCaptions: null,
      teachesThisSkill: 0.9,
      levelFit: 0.9,
      style: 'technique',
      matchedQuestText: null,
    }
    // Old pools stored before the field existed have no channelId key at all.
    if (channelId === undefined) {
      const { channelId: _drop, ...old } = v
      return old as PoolVideo
    }
    return { ...v, channelId }
  }

  it('copies channelId and reads a missing one as null', () => {
    const pool = { videos: [poolVideo('a', 'UCa'), poolVideo('b', undefined)] } as unknown as VideoPool
    const out = composeVideos({ language: 'en', goal: 'none', userPool: pool, enPool: null })
    const byId = new Map(out.map((v) => [v.id, v.channelId]))
    expect(byId.get('a')).toBe('UCa')
    expect(byId.get('b')).toBeNull()
  })
})
