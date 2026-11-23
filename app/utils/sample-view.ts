// What the sample page shows, from a Sample (spec: sample-path, Requirements 4, 5, 7 and 8). Pure.
import type { SamplePath, SampleVideo } from '#shared/types/sample-path'
import type { QuestTriple } from '#shared/types/skill-tree'
import type { RankedVideo } from '#shared/types/video'
import type { FinishLineView } from '~/utils/finish-line'
import { sampleCounts } from '#shared/utils/sample-path'
import type { CanvasPreview, PreviewHeader } from '~/utils/path-preview'
import { SAMPLE_COPY } from '~/utils/sample-copy'

/** "PHOTOGRAPHY · 14 SKILLS · 3 SECTIONS", counted from the Sample (Req 4.5). */
export function introLine(sample: SamplePath): string {
  const { skills, sections } = sampleCounts(sample)
  return SAMPLE_COPY.introLine(sample.hobby, skills, sections)
}

/**
 * The canvas texts of Preview_Mode (Req 5.2, 5.5): the tag, a sub label per skill, and one header
 * per section. The first section is the banner with its skill count; each later one a divider
 * that names the milestone it opens after, unless the section before it has none.
 */
export function canvasPreview(sample: SamplePath): CanvasPreview {
  const firstId = sample.sections[0]?.skills[0]?.id
  const status: Record<string, string> = {}
  for (const section of sample.sections) {
    for (const skill of section.skills) {
      status[skill.id] =
        skill.id === firstId
          ? SAMPLE_COPY.firstStatus(skill.quests.length, skill.videos.length)
          : skill.milestone
            ? SAMPLE_COPY.milestone
            : SAMPLE_COPY.tapToPreview
    }
  }
  const headers = sample.sections.map((section, index): PreviewHeader => {
    const eyebrow = `SECTION ${index + 1} · ${section.level.toUpperCase()}`
    if (index === 0) {
      return { variant: 'banner', eyebrow, title: section.name, countText: SAMPLE_COPY.bannerCount(section.skills.length), note: null }
    }
    const previousHasMilestone = sample.sections[index - 1]?.skills.some((skill) => skill.milestone) ?? false
    return {
      variant: 'divider',
      eyebrow,
      title: section.name,
      countText: null,
      note: previousHasMilestone ? SAMPLE_COPY.opensAfter(index) : null,
    }
  })
  // 5 lines: the last skill is titled with the finish line, up to about 50 characters (Req 14.5).
  return { tag: SAMPLE_COPY.nodeTag, status, headers, titleLines: 5 }
}

/** A sample video as the existing video card takes it. Fields the card does not show are fixed. */
export function toRankedVideo(video: SampleVideo): RankedVideo {
  return {
    id: video.id,
    title: video.title,
    channel: video.channel,
    channelId: null,
    thumbnailUrl: video.thumbnailUrl,
    durationSeconds: video.durationSeconds,
    style: 'explainer',
    matchedQuestText: null,
    poolLanguage: 'en',
  }
}

export interface PreviewModel {
  id: string
  /** "FIRST SKILL" or "PREVIEW". */
  tag: string
  /** 1 based. */
  position: { section: number; skill: number }
  title: string
  description: string
  quests: QuestTriple<string>
  /** Empty: the preview shows the fallback line (Req 8.5). */
  videos: RankedVideo[]
}

/** The Skill_Preview of one skill (Req 7.4), or null for an id the Sample does not hold. */
export function previewModel(sample: SamplePath, skillId: string): PreviewModel | null {
  const firstId = sample.sections[0]?.skills[0]?.id
  for (const [s, section] of sample.sections.entries()) {
    for (const [k, skill] of section.skills.entries()) {
      if (skill.id !== skillId) continue
      return {
        id: skill.id,
        tag: skill.id === firstId ? SAMPLE_COPY.previewFirst : SAMPLE_COPY.previewOther,
        position: { section: s + 1, skill: k + 1 },
        title: skill.title,
        description: skill.desc,
        quests: skill.quests,
        videos: skill.videos.map(toRankedVideo),
      }
    }
  }
  return null
}

/**
 * The finish line card's view for its plain variant (Req 6.1): only `title` is shown; the counts
 * are filled so the type holds, and stay hidden.
 */
export function finishView(sample: SamplePath): FinishLineView {
  const { skills } = sampleCounts(sample)
  return { state: 'not-started', title: sample.finish, done: 0, total: skills, left: skills, percent: 0, nextMilestone: null, reachedAt: null }
}

/** The id of the first skill: the default selection on desktop (Req 7.1). */
export function firstSkillId(sample: SamplePath): string | null {
  return sample.sections[0]?.skills[0]?.id ?? null
}
