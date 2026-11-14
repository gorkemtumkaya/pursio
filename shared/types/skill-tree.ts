export type Level = 'beginner' | 'intermediate' | 'advanced'

/** Exactly three items, one per quest. */
export type QuestTriple<T> = [T, T, T]

export interface SkillNode {
  id: string
  title: string
  description: string
  prerequisites: string[]
  optional: boolean
  milestone: boolean
  quests: QuestTriple<string>
  /** 2 to 3 video search strings; absent on paths made before the video pipeline. */
  searchQueries?: string[]
  /** True when videos shorter than 60 s are fine; absent means false. */
  quickTip?: boolean
}

export interface Section {
  title: string
  level: Level
  nodes: SkillNode[]
}

export interface SkillTree {
  hobby: string
  sections: Section[]
  mascot: { set: string }
}
