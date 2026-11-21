import { normalizeHobby } from './llm'

/** Active hobbies a free account can have. Paid accounts (founding members, Plus) have no limit. */
export const FREE_HOBBY_LIMIT = 3

/** What the limit needs to know about one hobby of the account. */
export interface LimitHobby {
  /** The Hobby_Id: the normalized hobby of the saved tree. */
  hobbyId: string
  /** The hobby as the learner typed it, when known. */
  hobby?: string
  archived: boolean
  /** The demo path. It is never stored for an account, so only a client can set this. */
  demo?: boolean
}

/** The hobbies that count toward the limit: not archived and not the demo path. */
export function countedHobbies<H extends LimitHobby>(hobbies: readonly H[]): H[] {
  return hobbies.filter((hobby) => !hobby.archived && hobby.demo !== true)
}

/**
 * Whether building `requested` replaces a hobby that already counts, instead of
 * adding one. Compared after normalizing, against the Hobby_Id and the typed
 * hobby. An archived hobby is not a rebuild: building it again restores it,
 * which takes a slot.
 */
export function isRebuild(hobbies: readonly LimitHobby[], requested: string): boolean {
  const wanted = normalizeHobby(requested)
  if (wanted === '') return false
  return countedHobbies(hobbies).some(
    (hobby) => normalizeHobby(hobby.hobbyId) === wanted || (hobby.hobby !== undefined && normalizeHobby(hobby.hobby) === wanted),
  )
}

/**
 * Whether the free-plan limit stops a build.
 * - An unlimited account is never stopped.
 * - Below the limit nothing is stopped.
 * - At or above it (an account that already has more keeps them all), only a
 *   rebuild of a counted hobby goes through. `requested: null` asks "can this
 *   account add any new hobby?".
 */
export function hobbyLimitBlocks(input: {
  hobbies: readonly LimitHobby[]
  requested: string | null
  unlimited: boolean
}): boolean {
  if (input.unlimited) return false
  if (countedHobbies(input.hobbies).length < FREE_HOBBY_LIMIT) return false
  return input.requested === null || !isRebuild(input.hobbies, input.requested)
}
