import type { Level, QuestTriple } from './skill-tree'

/** Sample_Slug: the hobbies that have a public sample page (spec: sample-path, Requirement 1). */
export type SampleSlug = 'photography' | 'guitar' | 'birdwatching'

export interface SampleVideo {
  /** YouTube video id, 11 characters. */
  id: string
  title: string
  channel: string
  durationSeconds: number
  /** An `https://i.ytimg.com/` URL. */
  thumbnailUrl: string
}

export interface SampleSkill {
  id: string
  title: string
  desc: string
  milestone: boolean
  quests: QuestTriple<string>
  /** May be empty: the preview then shows a fallback line. */
  videos: SampleVideo[]
}

export interface SampleSection {
  level: Level
  name: string
  skills: SampleSkill[]
}

/** The checked content of a Sample_File, `data/samples/<slug>.json` (Requirement 2). */
export interface SamplePath {
  slug: SampleSlug
  hobby: string
  /** Wick's outfit; an unknown value falls back to the default outfit when drawn. */
  mascot: string
  /** The finish line: the intro heading and the finish line card. */
  finish: string
  sections: SampleSection[]
}
