// Every fixed text of the sample path page (spec: sample-path, Requirement 13).
// No dash or hyphen character in any string; tests/unit/sample-copy.test.ts checks it.
import type { SampleSlug } from '#shared/types/sample-path'

function count(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`
}

/** Divider lines of the sections after the first (Req 5.2, AS4), by section index. */
function opensAfter(sectionIndex: number): string {
  if (sectionIndex === 1) return 'Opens after the first milestone'
  if (sectionIndex === 2) return 'Opens after the second milestone'
  return 'Opens after the milestone above'
}

/** Example notes in the note box, per hobby (decision 15). The fallback is a draft. */
const PLACEHOLDERS: Record<SampleSlug, string> = {
  photography: 'I shoot on auto with a mirrorless camera. I want portraits with a soft background.',
  guitar: 'I know a few chords and play the same old songs. I want to sing while I play.',
  birdwatching: 'I can only name a sparrow and a crow. I want to know the birds in my local park.',
}
const PLACEHOLDER_FALLBACK = 'I am new to this. I want to get good enough to enjoy it.'

export const SAMPLE_COPY = {
  /** The tab title: "<Hobby> sample path · Pursio" (Req 1.9). */
  pageTitle: (hobby: string): string => `${hobby} sample path · Pursio`,

  // Top bar (Req 4.1 to 4.3)
  tag: 'SAMPLE PATH',
  logIn: 'Log in',
  buildOwn: 'Build my own path',

  // Intro card (Req 4.5, 4.6)
  introLine: (hobby: string, skills: number, sections: number): string =>
    `${hobby.toUpperCase()} · ${count(skills, 'SKILL', 'SKILLS')} · ${count(sections, 'SECTION', 'SECTIONS')}`,
  introText: 'Tap any skill to see its quests and videos. This is an example. Tell Wick where you are and he rebuilds it around you.',

  // Path (Req 5.2 to 5.5, 5.9)
  loading: 'Loading the path…',
  drawFailed: 'This path could not be drawn.',
  nodeTag: 'START HERE',
  tapToPreview: 'Tap to preview',
  milestone: 'Milestone',
  firstStatus: (quests: number, videos: number): string =>
    videos === 0 ? count(quests, 'quest', 'quests') : `${count(quests, 'quest', 'quests')} · ${count(videos, 'video', 'videos')}`,
  bannerCount: (skills: number): string => count(skills, 'skill', 'skills'),
  opensAfter,

  // Skill preview (Req 7.4, 8.1, 8.5)
  previewFirst: 'FIRST SKILL',
  previewOther: 'PREVIEW',
  position: (section: number, skill: number): string => `Section ${section} · Skill ${skill}`,
  questsHeading: (quests: number): string => count(quests, 'QUEST', 'QUESTS'),
  questXp: (xp: number): string => `+${xp} XP EACH`,
  videosHeading: 'VIDEOS PICKED FOR THIS SKILL',
  noVideos: 'Videos appear when you reach this skill.',
  makeMine: 'Make this path mine',

  // Make it yours (Req 9.1, 9.4)
  mineHeading: 'Make it yours',
  mineLabel: 'Tell Wick where you are and where you want to get. He rebuilds this path around you.',
  build: 'Build my path',
  smallLine: 'Free to try. No signup. About 20 seconds.',
  barLine: 'Free. No signup.',
  barButton: 'Tell Wick where I am',
  skip: 'Skip, build it without a note',
  placeholder: (slug: SampleSlug | string): string =>
    Object.hasOwn(PLACEHOLDERS, slug) ? PLACEHOLDERS[slug as SampleSlug] : PLACEHOLDER_FALLBACK,

  // Founding line, desktop only (Req 9.10, decision 14). Draft: the owner confirms the wording.
  foundingLine: 'Founding members keep Plus for life.',
  foundingLink: 'See the offer',
} as const
