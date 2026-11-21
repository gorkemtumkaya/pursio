import type { FreshPathSkill, FreshRequest, FreshRequestPath } from '#shared/types/fresh'
import type { Progress } from '#shared/types/progress'
import type { SkillTree } from '#shared/types/skill-tree'
import type { ColorSlot } from '#shared/utils/color-slot'
import { effectiveCompleted, findCurrentNodeId } from '#shared/utils/progress-engine'
import { languageCode } from '#shared/utils/video-normalize'
import type { HobbyLibrary, HobbyRecord } from './hobby-store'

/** Body limits of the Fresh_Endpoint (spec: fresh, Req 8.3). */
export const FRESH_MAX_PATHS = 10
export const FRESH_MAX_SKILLS = 200
export const FRESH_MAX_TEXT = 100

function clip(text: string): string {
  return text.trim().slice(0, FRESH_MAX_TEXT).trim()
}

/**
 * One request path from a tree and its Progress (Req 8.2): every Skill in path order
 * with its section Level, and the Current_Skill from `findCurrentNodeId` (null when every
 * Skill is completed, decision D16). Texts are clipped to the body limits; Skills with an
 * empty title are left out. Returns null when the path cannot be sent (empty hobby or no Skill).
 * `completedCount` counts the completed Skills among the ones sent, so it never exceeds them
 * (spec: fresh-v2, Req 9.9).
 */
export function requestPath(
  id: string,
  tree: SkillTree,
  progress: Progress,
  colorSlot: ColorSlot,
): FreshRequestPath | null {
  const hobby = clip(tree.hobby)
  if (id.length === 0 || hobby.length === 0) return null
  const skills: FreshPathSkill[] = []
  const seen = new Set<string>()
  for (const section of tree.sections) {
    for (const node of section.nodes) {
      const title = clip(node.title)
      if (node.id.length === 0 || seen.has(node.id) || title.length === 0) continue
      seen.add(node.id)
      skills.push({ id: node.id, title, level: section.level })
    }
  }
  const kept = skills.slice(0, FRESH_MAX_SKILLS)
  if (kept.length === 0) return null
  const current = findCurrentNodeId(tree, progress)
  const currentSkillId = current !== null && kept.some((s) => s.id === current) ? current : null
  const completed = effectiveCompleted(tree, progress)
  const completedCount = kept.filter((s) => completed.has(s.id)).length
  return { id, hobby, skills: kept, currentSkillId, colorSlot, completedCount }
}

/**
 * Paths most recently active first: the Active_Hobby, then the latest added. No per-path
 * activity time is kept on the device, so this is the closest local order (Req 9.11).
 */
export function orderByLocalActivity(library: HobbyLibrary): HobbyRecord[] {
  return library.hobbies
    .map((hobby, index) => ({ hobby, index }))
    .filter(({ hobby }) => !hobby.archived)
    .sort((a, b) => {
      const activeA = a.hobby.id === library.activeId ? 0 : 1
      const activeB = b.hobby.id === library.activeId ? 0 : 1
      if (activeA !== activeB) return activeA - activeB
      if (a.hobby.addedAt !== b.hobby.addedAt) return b.hobby.addedAt - a.hobby.addedAt
      return b.index - a.index
    })
    .map(({ hobby }) => hobby)
}

/** Signed_Out_User body from the local Hobby_Library and each hobby's Progress (Req 8.2). */
export function signedOutBody(
  library: HobbyLibrary,
  progressOf: (hobby: HobbyRecord) => Progress,
  language: string | null,
): FreshRequest {
  const paths: FreshRequestPath[] = []
  for (const hobby of orderByLocalActivity(library)) {
    if (paths.length >= FRESH_MAX_PATHS) break
    const path = requestPath(hobby.id, hobby.tree, progressOf(hobby), hobby.colorSlot)
    if (path) paths.push(path)
  }
  return { language: languageCode(language), paths }
}

/**
 * Demo_Mode body: the Demo_Paths (the Sample_Tree with its local Progress), never a token
 * (Req 8.15). The Demo_Path uses Color_Slot 1 (spec: fresh-v2, Req 9.9).
 */
export function demoBody(id: string, tree: SkillTree, progress: Progress, language: string | null): FreshRequest {
  const path = requestPath(id, tree, progress, 1)
  return { language: languageCode(language), paths: path ? [path] : [] }
}

/** A Signed_In_User's body: the Server reads the paths with the token and ignores the body (Req 8.1). */
export function signedInBody(language: string | null): FreshRequest {
  return { language: languageCode(language), paths: [] }
}

export type FreshRequestSource =
  | { kind: 'demo'; id: string; tree: SkillTree; progress: () => Progress; language: () => string | null }
  | {
      kind: 'account'
      /** The current Access_Token, or null when no session could start. */
      token: () => Promise<string | null>
      /** The local Hobby_Library, read only when there is no token. */
      library: () => HobbyLibrary
      progressOf: (hobby: HobbyRecord) => Progress
      language: () => string | null
    }

/**
 * The body and token of one Fresh_Endpoint request. Demo_Mode never asks for a token
 * and sends the Demo_Paths (Req 8.15); with a token the Server reads the stored paths;
 * without one the local Hobby_Library is sent as a Signed_Out_User request (Req 8.2).
 */
export async function buildFreshRequest(source: FreshRequestSource): Promise<{ body: FreshRequest; token: string | null }> {
  if (source.kind === 'demo') {
    return { body: demoBody(source.id, source.tree, source.progress(), source.language()), token: null }
  }
  const token = await source.token()
  if (token !== null) return { body: signedInBody(source.language()), token }
  return { body: signedOutBody(source.library(), source.progressOf, source.language()), token: null }
}
