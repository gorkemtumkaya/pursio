// Fake `DeleteDeps` for the Delete_Route tests (spec: accounts-cloud-save, tasks 4.9 and 4.11).
import type { DeleteDeps } from '../../server/utils/account-handlers'

export const TOKEN = 'token-a'
export const USER_ID = 'user-a'
export const SERVICE_KEY = 'service-role-placeholder'

export interface DeleteCalls {
  /** Tokens given to `verifyToken`. */
  verify: string[]
  /** User ids given to `deleteUser`. */
  deleteUser: string[]
  /** The full argument list of every log call, so extra arguments would be seen. */
  log: unknown[][]
}

export interface FakeDeleteOptions {
  /** Access_Token to user id. Unknown tokens verify to null. Default: `{ [TOKEN]: USER_ID }`. */
  users?: Record<string, string>
  verifyToken?: DeleteDeps['verifyToken']
  deleteUser?: DeleteDeps['deleteUser']
  serviceRoleKey?: string
  verifyTimeoutMs?: number
  deleteTimeoutMs?: number
}

export interface FakeDelete {
  deps: DeleteDeps
  calls: DeleteCalls
}

export function fakeDeleteDeps(options: FakeDeleteOptions = {}): FakeDelete {
  const calls: DeleteCalls = { verify: [], deleteUser: [], log: [] }
  const users = options.users ?? { [TOKEN]: USER_ID }
  const verifyInner: DeleteDeps['verifyToken'] =
    options.verifyToken ?? (async (token) => (Object.hasOwn(users, token) ? (users[token] ?? null) : null))
  const deleteInner: DeleteDeps['deleteUser'] = options.deleteUser ?? (async () => {})

  const deps: DeleteDeps = {
    verifyToken(token, signal) {
      calls.verify.push(token)
      return verifyInner(token, signal)
    },
    serviceRoleKey: options.serviceRoleKey ?? SERVICE_KEY,
    deleteUser(userId) {
      calls.deleteUser.push(userId)
      return deleteInner(userId)
    },
    verifyTimeoutMs: options.verifyTimeoutMs ?? 1_000,
    deleteTimeoutMs: options.deleteTimeoutMs ?? 1_000,
    log: (...args: unknown[]) => {
      calls.log.push(args)
    },
  }

  return { deps, calls }
}
