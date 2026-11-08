// Visual mappings for skill nodes, node detail and trail segments.
// Every class string is a complete static literal so Tailwind's scanner
// finds each utility. Only theme token utilities are used.
import type { NodeState } from '#shared/types/progress'
import type { IconName } from './icons'
import type { TrailSegment } from './path-layout'

export interface NodeVisual {
  /** Fill, shadow, outline and shape classes for the node button. */
  classes: string
  icon: IconName
  /** Text color class for the icon (icons use `currentColor`). */
  iconClass: string
  /** Draw the node at the Milestone_Node size (Req 4.12, 6.9). */
  milestoneSize: boolean
  /** Draw the Progress_Ring around the node (Req 6.5). */
  ring: boolean
  /** Draw the "NEXT UP" tag above the node (Req 6.5). */
  nextUp: boolean
  /** Title color in the node label (Req 6.12). */
  titleClass: string
  /** Status line color in the node label. */
  statusClass: string
}

const COMPLETED: NodeVisual = {
  classes: 'rounded-node bg-done shadow-raised-done',
  icon: 'check',
  iconClass: 'text-done-ink',
  milestoneSize: false,
  ring: false,
  nextUp: false,
  titleClass: 'text-ink',
  statusClass: 'text-muted',
}

const CURRENT: NodeVisual = {
  classes: 'rounded-node bg-primary shadow-raised-primary',
  icon: 'star',
  iconClass: 'text-primary-ink',
  milestoneSize: false,
  ring: true,
  nextUp: true,
  titleClass: 'text-ink',
  statusClass: 'text-accent-text',
}

const CURRENT_MILESTONE: NodeVisual = {
  classes: 'rounded-node bg-gold shadow-raised-gold',
  icon: 'trophy',
  iconClass: 'text-ink',
  milestoneSize: true,
  ring: true,
  nextUp: true,
  titleClass: 'text-ink',
  statusClass: 'text-accent-text',
}

const SIDE_QUEST: NodeVisual = {
  classes: 'rounded-node bg-surface shadow-raised-line border-3 border-dashed border-trail',
  icon: 'compass',
  iconClass: 'text-ink',
  milestoneSize: false,
  ring: false,
  nextUp: false,
  titleClass: 'text-ink',
  statusClass: 'text-muted',
}

const MILESTONE: NodeVisual = {
  classes: 'rounded-node bg-locked shadow-raised-locked',
  icon: 'trophy',
  iconClass: 'text-locked-ink',
  milestoneSize: true,
  ring: false,
  nextUp: false,
  titleClass: 'text-ink',
  statusClass: 'text-muted',
}

const LOCKED: NodeVisual = {
  classes: 'rounded-node bg-locked shadow-raised-locked',
  icon: 'lock',
  iconClass: 'text-locked-ink',
  milestoneSize: false,
  ring: false,
  nextUp: false,
  titleClass: 'text-muted',
  statusClass: 'text-muted',
}

/** Desktop selection outline (Req 8.15), applied when the selected node is not `current`. */
export const NODE_SELECTED_CLASS = 'outline-4 outline-offset-6 outline-ink'

/**
 * Node look per state (design "Node visuals" table). `isMilestone` only
 * changes the `current` look: a milestone Current_Node is gold with a trophy
 * (Req 4.12). Completed milestones keep the size the layout assigns.
 */
export function nodeVisual(state: NodeState, isMilestone: boolean): NodeVisual {
  switch (state) {
    case 'completed':
      return COMPLETED
    case 'current':
      return isMilestone ? CURRENT_MILESTONE : CURRENT
    case 'side_quest':
      return SIDE_QUEST
    case 'milestone':
      return MILESTONE
    case 'locked':
      return LOCKED
  }
}

function clampChecked(checked: number): 0 | 1 | 2 | 3 {
  if (!Number.isFinite(checked) || checked <= 0) return 0
  if (checked >= 3) return 3
  return Math.floor(checked) as 0 | 1 | 2
}

/** Progress_Ring fill in degrees: `checked * 120`, clamped to 0–3 checks (Req 6.6). */
export function ringDegrees(checked: number): number {
  return clampChecked(checked) * 120
}

/** Status line under or beside the node title (Req 6.11). */
export function statusLine(state: NodeState, checked: number): string {
  switch (state) {
    case 'completed':
      return 'Done'
    case 'current':
      return `In progress · ${clampChecked(checked)}/3`
    case 'side_quest':
      return 'Side quest'
    case 'milestone':
      return 'Milestone'
    case 'locked':
      return 'Locked'
  }
}

export interface ChipVisual {
  label: string
  classes: string
}

/** State chip in the Node_Detail (Req 8.4). */
export function chipFor(state: NodeState): ChipVisual {
  switch (state) {
    case 'completed':
      return { label: 'COMPLETED', classes: 'bg-done text-done-ink' }
    case 'current':
      return { label: 'IN PROGRESS', classes: 'bg-primary-soft text-accent-text' }
    case 'side_quest':
      return { label: 'SIDE QUEST', classes: 'bg-surface-2 text-ink' }
    case 'milestone':
      return { label: 'MILESTONE', classes: 'bg-surface-2 text-ink' }
    case 'locked':
      return { label: 'LOCKED', classes: 'bg-surface-2 text-muted' }
  }
}

export interface ButtonVisual {
  label: 'Mark complete' | 'Completed' | 'Locked'
  enabled: boolean
  classes: string
}

const BUTTON_ENABLED = 'bg-primary text-primary-ink shadow-raised-primary font-head'
const BUTTON_DISABLED = 'bg-surface-2 text-muted'

/**
 * Node_Detail action button (Req 8.10–8.12). A milestone Current_Node has
 * state `current`, so it gets the enabled button.
 */
export function buttonFor(state: NodeState): ButtonVisual {
  switch (state) {
    case 'current':
    case 'side_quest':
      return { label: 'Mark complete', enabled: true, classes: BUTTON_ENABLED }
    case 'completed':
      return { label: 'Completed', enabled: false, classes: BUTTON_DISABLED }
    case 'milestone':
    case 'locked':
      return { label: 'Locked', enabled: false, classes: BUTTON_DISABLED }
  }
}

/**
 * Id of the Node_Detail title for a layout, so the Bottom_Sheet can point
 * `aria-labelledby` at it. Only one layout renders at a time.
 */
export function detailTitleId(layout: 'sheet' | 'panel'): string {
  return `node-detail-title-${layout}`
}

/** Joins titles with ", " and " and " before the last: "A", "A and B", "A, B and C" (Req 8.9). */
export function formatTitleList(titles: readonly string[]): string {
  if (titles.length <= 1) return titles[0] ?? ''
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
}

/** `done` when both ends of the segment are completed, otherwise `trail` (Req 6.2, 6.3). */
export function segmentTone(
  states: ReadonlyMap<string, NodeState>,
  seg: Pick<TrailSegment, 'fromId' | 'toId'>,
): 'done' | 'trail' {
  return states.get(seg.fromId) === 'completed' && states.get(seg.toId) === 'completed' ? 'done' : 'trail'
}
