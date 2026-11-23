import type { Progress } from '#shared/types/progress'
import type { SkillNode, SkillTree } from '#shared/types/skill-tree'
import { effectiveCompleted } from '#shared/utils/progress-engine'
import { finalNode } from '#shared/utils/skill-tree-load'

/** `reached` once the Final_Milestone is completed; before that, `in-progress` from the first completed Main_Node. */
export type FinishLineState = 'not-started' | 'in-progress' | 'reached'

/** What the finish line card on the path shows (design: "Finish line card · three states"). */
export interface FinishLineView {
  state: FinishLineState
  /** The Finish_Line, which is also the title of the Final_Milestone. */
  title: string
  /** Completed Main_Nodes, Known_Nodes included. Side quests are not on the way to the finish line. */
  done: number
  /** Main_Nodes of the path. */
  total: number
  left: number
  /** Whole percent of `done` in `total`, for the bar. */
  percent: number
  /** Title of the next open milestone before the Final_Milestone, or null when only the finish line is left. */
  nextMilestone: string | null
  /** Completion time of the Final_Milestone in epoch ms; null when not reached or when no time was stored. */
  reachedAt: number | null
}

/** Main_Nodes in document order; the first Node wins on a repeated id, as in the progress engine. */
function mainNodes(tree: SkillTree): SkillNode[] {
  const seen = new Set<string>()
  const main: SkillNode[] = []
  for (const section of tree.sections) {
    for (const node of section.nodes) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      if (!node.optional) main.push(node)
    }
  }
  return main
}

/**
 * The card's state from the tree and the Progress, so it follows a completion, a reset and a
 * restore in the same render. `completedAt` holds the Completion_Timestamps of the path; a path
 * saved in the browser only has none.
 */
export function finishLineView(
  tree: SkillTree,
  progress: Progress,
  finishLine: string,
  completedAt: Readonly<Record<string, number>> = {},
): FinishLineView {
  const completed = effectiveCompleted(tree, progress)
  const main = mainNodes(tree)
  const last = finalNode(tree)
  const done = main.filter(node => completed.has(node.id)).length
  const total = main.length
  const reached = last !== undefined && completed.has(last.id)
  const next = main.find(node => node.milestone && node.id !== last?.id && !completed.has(node.id))
  const time = reached && Object.hasOwn(completedAt, last.id) ? completedAt[last.id] : undefined
  return {
    state: reached ? 'reached' : done === 0 ? 'not-started' : 'in-progress',
    title: finishLine,
    done,
    total,
    left: total - done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    nextMilestone: reached ? null : (next?.title ?? null),
    reachedAt: typeof time === 'number' && Number.isFinite(time) ? time : null,
  }
}

function skills(count: number): string {
  return count === 1 ? '1 skill' : `${count} skills`
}

/** "21 Nov 2026" in the reader's locale. */
function reachedDate(time: number, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(time))
}

/** Text of the finish line card. */
export const FINISH_LINE_COPY = {
  /** One line under the path title. */
  goal: (finishLine: string): string => `Goal: ${finishLine}`,
  eyebrow: 'The finish line',
  eyebrowReached: 'Finish line reached',
  /** Badge of the not started card where there is room for it. */
  toGo: (left: number): string => `${skills(left)} to go`,
  /** Line of the not started card on a narrow column. */
  between: (left: number): string => `${skills(left)} between you and this.`,
  count: (done: number, total: number): string => `${done} of ${skills(total)}`,
  left: (left: number): string => `${left} to go`,
  nextMilestone: (title: string): string => `Next milestone: ${title}`,
  /** The date is left out when no Completion_Timestamp is stored. */
  reached: (done: number, total: number, reachedAt: number | null, locale?: string): string =>
    reachedAt === null
      ? `${done} of ${skills(total)}`
      : `${done} of ${skills(total)} · reached on ${reachedDate(reachedAt, locale)}`,
} as const
