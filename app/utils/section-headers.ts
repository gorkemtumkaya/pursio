import type { Progress } from '#shared/types/progress'
import type { SkillTree } from '#shared/types/skill-tree'
import { activeSectionIndex } from '#shared/utils/progress-engine'

export interface SectionHeaderModel {
  /** 0-based; the eyebrow shows index + 1. */
  index: number
  /** e.g. "SECTION 2 · INTERMEDIATE" */
  eyebrow: string
  title: string
  variant: 'banner' | 'divider'
  /** Completed and total Main_Nodes; banner only. */
  count: { done: number; total: number } | null
  /** Title of the previous Section's last incomplete Milestone_Node; divider only. */
  lockedBy: string | null
}

/**
 * One header per Section in order. The Active_Section is the only banner (Req 7.2, 7.3).
 * Computed from `progress`, so a completion updates every header in the same render (Req 7.6, 7.7).
 */
export function sectionHeaderModels(tree: SkillTree, progress: Progress): SectionHeaderModel[] {
  const done = new Set(progress.completed)
  const active = activeSectionIndex(tree, progress)

  return tree.sections.map((section, index): SectionHeaderModel => {
    const eyebrow = `SECTION ${index + 1} · ${section.level.toUpperCase()}`

    if (index === active) {
      const main = section.nodes.filter((n) => !n.optional)
      const count = { done: main.filter((n) => done.has(n.id)).length, total: main.length }
      return { index, eyebrow, title: section.title, variant: 'banner', count, lockedBy: null }
    }

    const previous = index > 0 ? tree.sections[index - 1] : undefined
    const blocker = previous?.nodes.findLast((n) => n.milestone && !done.has(n.id))
    const lockedBy = blocker?.title ?? null
    return { index, eyebrow, title: section.title, variant: 'divider', count: null, lockedBy }
  })
}
