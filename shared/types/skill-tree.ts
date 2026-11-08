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
