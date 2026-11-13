import type { DeleteErrorCode, DeleteResponse } from '../../shared/types/cloud'
import { parseBearer } from '../../shared/utils/auth'
import { withTimeout, type HandlerResponse } from './llm-handlers'

export const DELETE_ERROR_STATUS: Record<DeleteErrorCode, number> = {
  unauthorized: 401,
  no_key: 503,
  delete_failed: 502,
}

export interface DeleteDeps {
  /** The user id of a valid Access_Token, else null. */
  verifyToken: (token: string, signal: AbortSignal) => Promise<string | null>
  /** Service_Role_Key. Only checked for emptiness here; `deleteUser` holds the client. */
  serviceRoleKey: string
  /** Hard-deletes the Supabase user; throws on failure. */
  deleteUser: (userId: string) => Promise<void>
  verifyTimeoutMs: number
  deleteTimeoutMs: number
  /** Receives only the code, never tokens, keys or Supabase messages (Req 1.8). */
  log?: (entry: { code: DeleteErrorCode }) => void
}

/**
 * Delete_Route (spec: accounts-cloud-save, Req 11.9 to 11.11, 11.14, 11.17).
 * Deletes only the user of the verified Access_Token. The request URL and body
 * are not inputs, so a user id sent there can never be used.
 */
export async function handleDeleteAccount(
  input: { authorization: string | undefined },
  deps: DeleteDeps,
): Promise<HandlerResponse<DeleteResponse>> {
  const fail = (code: DeleteErrorCode): HandlerResponse<DeleteResponse> => {
    deps.log?.({ code })
    return { status: DELETE_ERROR_STATUS[code], body: { error: code } }
  }

  const token = parseBearer(input.authorization)
  if (token === null) return fail('unauthorized')
  let userId: string | null
  try {
    userId = await withTimeout<string | null>(deps.verifyTimeoutMs, null, (signal) => deps.verifyToken(token, signal))
  } catch {
    userId = null
  }
  if (typeof userId !== 'string' || userId === '') return fail('unauthorized')

  if (deps.serviceRoleKey.trim() === '') return fail('no_key')

  const verifiedId = userId
  let deleted: boolean
  try {
    deleted = await withTimeout(deps.deleteTimeoutMs, false, async () => {
      await deps.deleteUser(verifiedId)
      return true
    })
  } catch {
    deleted = false
  }
  if (!deleted) return fail('delete_failed')
  return { status: 200, body: { ok: true } }
}
