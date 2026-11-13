// Unit tests for handleDeleteAccount (spec: accounts-cloud-save, task 4.11).
import { describe, expect, it } from 'vitest'
import { DELETE_ERROR_STATUS, handleDeleteAccount } from '../../server/utils/account-handlers'
import { SERVICE_KEY, TOKEN, USER_ID, fakeDeleteDeps } from '../support/account-deps'
import { never } from '../support/tree-deps'

const SHORT_MS = 10
const UNAUTHORIZED = { status: 401, body: { error: 'unauthorized' } }
const authorization = `Bearer ${TOKEN}`

describe('handleDeleteAccount success', () => {
  it('answers 200 { ok: true } and deletes the verified user once', async () => {
    const fake = fakeDeleteDeps()
    const response = await handleDeleteAccount({ authorization }, fake.deps)

    expect(response).toEqual({ status: 200, body: { ok: true } })
    expect(fake.calls.verify).toEqual([TOKEN])
    expect(fake.calls.deleteUser).toEqual([USER_ID])
    expect(fake.calls.log).toEqual([])
  })
})

describe('handleDeleteAccount 401', () => {
  it.each([
    ['a missing header', undefined],
    ['an empty header', ''],
    ['another scheme', `Basic ${TOKEN}`],
    ['a scheme with no token', 'Bearer'],
    ['text after the token', `Bearer ${TOKEN} extra`],
    ['a rejected token', 'Bearer unknown-token'],
  ])('answers 401 for %s and deletes nobody', async (_name, header) => {
    const fake = fakeDeleteDeps()
    const response = await handleDeleteAccount({ authorization: header }, fake.deps)

    expect(response).toEqual(UNAUTHORIZED)
    expect(fake.calls.deleteUser).toEqual([])
  })

  it('answers 401 when the verifier throws', async () => {
    const fake = fakeDeleteDeps({
      verifyToken: async () => {
        throw new Error('auth server down')
      },
    })
    const response = await handleDeleteAccount({ authorization }, fake.deps)

    expect(response).toEqual(UNAUTHORIZED)
    expect(fake.calls.deleteUser).toEqual([])
  })

  it('answers 401 when the verifier passes its time limit', async () => {
    const fake = fakeDeleteDeps({ verifyTimeoutMs: SHORT_MS, verifyToken: () => never<string | null>() })
    const response = await handleDeleteAccount({ authorization }, fake.deps)

    expect(response).toEqual(UNAUTHORIZED)
    expect(fake.calls.deleteUser).toEqual([])
  })

  it('answers 401 before 503 when the key is also empty', async () => {
    const fake = fakeDeleteDeps({ serviceRoleKey: '' })
    const response = await handleDeleteAccount({ authorization: undefined }, fake.deps)
    expect(response).toEqual(UNAUTHORIZED)
  })
})

describe('handleDeleteAccount 503', () => {
  it.each([
    ['an empty', ''],
    ['a blank', '   '],
  ])('answers 503 no_key for %s key and deletes nobody', async (_name, serviceRoleKey) => {
    const fake = fakeDeleteDeps({ serviceRoleKey })
    const response = await handleDeleteAccount({ authorization }, fake.deps)

    expect(response).toEqual({ status: 503, body: { error: 'no_key' } })
    expect(fake.calls.deleteUser).toEqual([])
  })
})

describe('handleDeleteAccount 502', () => {
  it('answers 502 delete_failed when the delete throws', async () => {
    const fake = fakeDeleteDeps({
      deleteUser: async () => {
        throw new Error('supabase said no')
      },
    })
    const response = await handleDeleteAccount({ authorization }, fake.deps)

    expect(response).toEqual({ status: 502, body: { error: 'delete_failed' } })
    expect(fake.calls.deleteUser).toEqual([USER_ID])
  })

  it('answers 502 delete_failed when the delete passes its time limit', async () => {
    const fake = fakeDeleteDeps({ deleteTimeoutMs: SHORT_MS, deleteUser: () => never<void>() })
    const response = await handleDeleteAccount({ authorization }, fake.deps)

    expect(response).toEqual({ status: 502, body: { error: 'delete_failed' } })
  })
})

describe('handleDeleteAccount log', () => {
  it('receives the code only for each failure', async () => {
    const secret = 'supabase message with a secret detail'
    const unauthorized = fakeDeleteDeps()
    await handleDeleteAccount({ authorization: 'Bearer unknown-token' }, unauthorized.deps)
    expect(unauthorized.calls.log).toEqual([[{ code: 'unauthorized' }]])

    const noKey = fakeDeleteDeps({ serviceRoleKey: ' ' })
    await handleDeleteAccount({ authorization }, noKey.deps)
    expect(noKey.calls.log).toEqual([[{ code: 'no_key' }]])

    const failed = fakeDeleteDeps({
      deleteUser: async () => {
        throw new Error(secret)
      },
    })
    await handleDeleteAccount({ authorization }, failed.deps)
    expect(failed.calls.log).toEqual([[{ code: 'delete_failed' }]])

    const logged = JSON.stringify([unauthorized.calls.log, noKey.calls.log, failed.calls.log])
    for (const hidden of [TOKEN, 'unknown-token', USER_ID, SERVICE_KEY, secret]) {
      expect(logged).not.toContain(hidden)
    }
  })

  it('works without a log function', async () => {
    const fake = fakeDeleteDeps()
    const response = await handleDeleteAccount({ authorization: undefined }, { ...fake.deps, log: undefined })
    expect(response).toEqual(UNAUTHORIZED)
  })
})

describe('DELETE_ERROR_STATUS', () => {
  it('maps every code to its status', () => {
    expect(DELETE_ERROR_STATUS).toEqual({ unauthorized: 401, no_key: 503, delete_failed: 502 })
  })
})
