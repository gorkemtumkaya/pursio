// What the sample page shows (spec: sample-path, Requirements 4, 5, 7, 8; acceptance check 4).
import { describe, expect, it } from 'vitest'
import type { SamplePath, SampleSkill } from '../../shared/types/sample-path'
import { getSample } from '../../app/utils/sample-paths'
import { canvasPreview, firstSkillId, introLine, previewModel, toRankedVideo } from '../../app/utils/sample-view'

function load(slug: string): SamplePath {
  const sample = getSample(slug)
  if (!sample) throw new Error(`${slug} did not load`)
  return sample
}

function skill(id: string, milestone = false, videos = 0): SampleSkill {
  return {
    id,
    title: `Title ${id}`,
    desc: `Desc ${id}`,
    milestone,
    quests: ['A', 'B', 'C'],
    videos: Array.from({ length: videos }, (_, i) => ({
      id: `abcdefghij${i}`,
      title: `Video ${i}`,
      channel: 'Channel',
      durationSeconds: 60,
      thumbnailUrl: `https://i.ytimg.com/vi/abcdefghij${i}/mqdefault.jpg`,
    })),
  }
}

/** Sections given as lists of skills. */
function sampleOf(...sections: SampleSkill[][]): SamplePath {
  return {
    slug: 'guitar',
    hobby: 'Guitar',
    mascot: 'guitar',
    finish: 'Play a song',
    sections: sections.map((skills, i) => ({ level: 'beginner', name: `Section ${i + 1}`, skills })),
  }
}

describe('introLine', () => {
  it('counts the real files', () => {
    expect(introLine(load('photography'))).toBe('PHOTOGRAPHY · 14 SKILLS · 3 SECTIONS')
    expect(introLine(load('guitar'))).toBe('GUITAR · 9 SKILLS · 2 SECTIONS')
    expect(introLine(load('birdwatching'))).toBe('BIRDWATCHING · 13 SKILLS · 2 SECTIONS')
  })
})

describe('canvasPreview', () => {
  it('labels the real photography file as in the mockup', () => {
    const preview = canvasPreview(load('photography'))
    const sample = load('photography')
    const ids = sample.sections.flatMap((s) => s.skills)
    expect(preview.tag).toBe('START HERE')
    expect(preview.status[ids[0]!.id]).toBe('3 quests · 2 videos')
    for (const k of ids.slice(1)) expect(preview.status[k.id]).toBe(k.milestone ? 'Milestone' : 'Tap to preview')
    expect(preview.headers.map((h) => [h.variant, h.countText, h.note])).toEqual([
      ['banner', `${sample.sections[0]!.skills.length} skills`, null],
      ['divider', null, 'Opens after the first milestone'],
      ['divider', null, 'Opens after the second milestone'],
    ])
    expect(preview.headers[0]!.eyebrow).toBe(`SECTION 1 · ${sample.sections[0]!.level.toUpperCase()}`)
  })

  it('names the first skill’s content without videos, and uses singular forms', () => {
    expect(canvasPreview(sampleOf([skill('a')])).status.a).toBe('3 quests')
    expect(canvasPreview(sampleOf([skill('a', false, 1)])).status.a).toBe('3 quests · 1 video')
    expect(canvasPreview(sampleOf([skill('a')])).headers[0]!.countText).toBe('1 skill')
  })

  it('a first skill that is a milestone still shows its content', () => {
    expect(canvasPreview(sampleOf([skill('a', true, 2)])).status.a).toBe('3 quests · 2 videos')
  })

  it('names the milestone a section opens after, and leaves the line out when the section before has none', () => {
    const preview = canvasPreview(
      sampleOf([skill('a'), skill('b', true)], [skill('c')], [skill('d'), skill('e', true)], [skill('f')]),
    )
    expect(preview.headers.map((h) => h.note)).toEqual([
      null,
      'Opens after the first milestone',
      null,
      'Opens after the milestone above',
    ])
  })
})

describe('previewModel', () => {
  it('gives the first skill its tag, position, quests and videos', () => {
    const sample = load('photography')
    const first = firstSkillId(sample)!
    const model = previewModel(sample, first)
    expect(model?.tag).toBe('FIRST SKILL')
    expect(model?.position).toEqual({ section: 1, skill: 1 })
    expect(model?.quests).toHaveLength(3)
    expect(model?.videos).toHaveLength(2)
  })

  it('a skill with an empty videos list gives an empty list: the page shows the fallback line (acceptance check 4)', () => {
    const sample = load('guitar')
    const noVideos = sample.sections.flatMap((s) => s.skills).find((k) => k.videos.length === 0)!
    const model = previewModel(sample, noVideos.id)
    expect(model?.videos).toEqual([])
    expect(model?.tag).toBe('PREVIEW')
  })

  it('counts positions within the section', () => {
    const sample = sampleOf([skill('a'), skill('b')], [skill('c'), skill('d')])
    expect(previewModel(sample, 'd')?.position).toEqual({ section: 2, skill: 2 })
    expect(previewModel(sample, 'missing')).toBeNull()
  })
})

describe('toRankedVideo', () => {
  it('keeps what the card shows and fixes the rest, with English so no language label shows', () => {
    const video = skill('a', false, 1).videos[0]!
    expect(toRankedVideo(video)).toEqual({
      id: video.id,
      title: video.title,
      channel: video.channel,
      channelId: null,
      thumbnailUrl: video.thumbnailUrl,
      durationSeconds: video.durationSeconds,
      style: 'explainer',
      matchedQuestText: null,
      poolLanguage: 'en',
    })
  })
})
