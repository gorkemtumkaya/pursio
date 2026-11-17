/**
 * Contract of the Color_Slot migration (spec: fresh-v2, task 2.5; Requirements 9.5 to 9.7).
 *
 * Two parts:
 *
 * 1. The migration text, always checked: the column and its 1 to 5 check, the backfill in
 *    `created_at, id` order per user, the `before insert` trigger and `not null`.
 * 2. The live database, checked only against a LOCAL Supabase stack with every migration
 *    applied (`supabase db reset`), through PostgREST as a signed-in user. Set:
 *
 *      SUPABASE_TEST_URL               local API URL, e.g. http://127.0.0.1:54321
 *      SUPABASE_TEST_ANON_KEY          the local anon key (`supabase status`)
 *      SUPABASE_TEST_SERVICE_ROLE_KEY  the local service_role key (`supabase status`)
 *
 *    The live suite is skipped when any of them is missing or the host is not local, so it
 *    can never reach a remote or production database. The backfill itself runs once, when
 *    the migration is applied, so its order is checked on the text and with the same rule
 *    in `fillColorSlots`; the live suite checks the trigger and the conflict update.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fillColorSlots } from '../../shared/utils/color-slot'

const sql = readFileSync(
  fileURLToPath(new URL('../../supabase/migrations/20261117000000_path_color_slot.sql', import.meta.url)),
  'utf8',
)
/** The statements without comments, lower-cased, whitespace collapsed. */
const statements = sql
  .replace(/--.*$/gm, '')
  .replace(/\s+/g, ' ')
  .toLowerCase()

describe('path color slot migration text', () => {
  it('adds a nullable smallint column with a 1 to 5 check, then sets it not null', () => {
    expect(statements).toContain(
      'alter table public.paths add column color_slot smallint check (color_slot between 1 and 5);',
    )
    const add = statements.indexOf('add column color_slot')
    const notNull = statements.indexOf('alter column color_slot set not null')
    const backfill = statements.indexOf('update public.paths')
    expect(add).toBeGreaterThanOrEqual(0)
    expect(backfill).toBeGreaterThan(add)
    expect(notNull).toBeGreaterThan(backfill)
  })

  it('backfills per user in created_at, id order with ((n - 1) % 5) + 1', () => {
    expect(statements).toContain('row_number() over (partition by user_id order by created_at, id)')
    expect(statements).toContain('set color_slot = ((numbered.n - 1) % 5) + 1')
    // The backfill has no archived filter: archived paths are counted (Req 9.7).
    const backfill = statements.slice(statements.indexOf('with numbered'), statements.indexOf('create function'))
    expect(backfill).not.toContain('archived')
  })

  it('gives the same slots as fillColorSlots for rows in creation order', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ addedAt: 1000 + i, colorSlot: null }))
    expect(fillColorSlots(rows)).toEqual(rows.map((_, i) => (i % 5) + 1))
  })

  it('assigns the slot in a before-insert trigger that runs as the caller', () => {
    expect(statements).toContain('create function public.assign_path_color_slot() returns trigger')
    expect(statements).toContain('security invoker')
    expect(statements).toContain('set search_path = public')
    expect(statements).toContain('if new.color_slot is not null then return new; end if;')
    expect(statements).toContain('order by p.created_at desc, p.id desc limit 1')
    expect(statements).toContain('case when v_prev is null then 1 else (v_prev % 5) + 1 end')
    expect(statements).toContain(
      'create trigger paths_assign_color_slot before insert on public.paths for each row execute function public.assign_path_color_slot();',
    )
  })

  it('leaves save_generated_path alone and lists the rollback', () => {
    expect(statements).not.toContain('save_generated_path')
    expect(sql).toContain('-- drop trigger paths_assign_color_slot on public.paths;')
    expect(sql).toContain('-- drop function public.assign_path_color_slot();')
    expect(sql).toContain('-- alter table public.paths drop column color_slot;')
  })
})

// ---------------------------------------------------------------------------------------
// Live database: local only
// ---------------------------------------------------------------------------------------

interface TestDbConfig {
  url: string
  anonKey: string
  serviceKey: string
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', 'host.docker.internal', 'kong'])

function testDbConfig(): TestDbConfig | null {
  const url = process.env.SUPABASE_TEST_URL?.trim() ?? ''
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY?.trim() ?? ''
  const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY?.trim() ?? ''
  if (url === '' || anonKey === '' || serviceKey === '') return null
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return null
  }
  return LOCAL_HOSTS.has(host) ? { url, anonKey, serviceKey } : null
}

const config = testDbConfig()
const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const
const RUN = randomUUID().slice(0, 8)

describe.skipIf(config === null)('path color slot (local Supabase)', () => {
  let service: SupabaseClient
  const users: { id: string; client: SupabaseClient }[] = []

  async function signedInUser(): Promise<{ id: string; client: SupabaseClient }> {
    const email = `color-slot-${RUN}-${users.length}@example.test`
    const password = `pw-${randomUUID()}`
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`)
    const c = createClient(config!.url, config!.anonKey, { auth: NO_SESSION })
    const signedIn = await c.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw new Error(`signIn: ${signedIn.error.message}`)
    const user = { id: created.data.user.id, client: c }
    users.push(user)
    return user
  }

  /** Inserts one path as its owner and returns the stored slot. `at` orders the rows. */
  async function insertPath(
    user: { id: string; client: SupabaseClient },
    hobbyId: string,
    at: number,
    extra: Record<string, unknown> = {},
  ): Promise<number> {
    const res = await user.client
      .from('paths')
      .insert({
        user_id: user.id,
        hobby: hobbyId,
        hobby_id: hobbyId,
        level: 'new',
        tree: {},
        mascot_set: 'explorer',
        model: 'test',
        created_at: new Date(at).toISOString(),
        ...extra,
      })
      .select('color_slot')
      .single()
    if (res.error) throw new Error(`insert ${hobbyId}: ${res.error.message}`)
    return (res.data as { color_slot: number }).color_slot
  }

  const BASE = Date.UTC(2026, 0, 1)

  beforeAll(() => {
    service = createClient(config!.url, config!.serviceKey, { auth: NO_SESSION })
  })

  afterAll(async () => {
    // Deleting the users cascades to their paths.
    for (const u of users) await service.auth.admin.deleteUser(u.id)
  }, 60_000)

  it('gives 1 to the first path, cycles 1..5 and goes from 5 back to 1', async () => {
    const user = await signedInUser()
    const slots: number[] = []
    for (let i = 0; i < 7; i += 1) slots.push(await insertPath(user, `h${i}`, BASE + i * 1000))
    expect(slots).toEqual([1, 2, 3, 4, 5, 1, 2])
  }, 60_000)

  it('counts archived paths and continues after a gap from the latest-created path', async () => {
    const user = await signedInUser()
    expect(await insertPath(user, 'a', BASE, { archived: true })).toBe(1)
    // An explicit slot is kept (Undo, legacy import), even when it leaves a gap.
    expect(await insertPath(user, 'b', BASE + 1000, { color_slot: 4 })).toBe(4)
    expect(await insertPath(user, 'c', BASE + 2000)).toBe(5)
    // The latest-created row decides, not the highest slot or the last insert.
    expect(await insertPath(user, 'd', BASE + 500)).toBe(1)
    expect(await insertPath(user, 'e', BASE + 3000)).toBe(1)
  }, 60_000)

  it('rejects a slot outside 1 to 5', async () => {
    const user = await signedInUser()
    await expect(insertPath(user, 'zero', BASE, { color_slot: 0 })).rejects.toThrow()
    await expect(insertPath(user, 'six', BASE, { color_slot: 6 })).rejects.toThrow()
  }, 60_000)

  it('keeps the slot when save_generated_path updates an existing path', async () => {
    const user = await signedInUser()
    const args = (hobbyId: string) => ({
      p_hobby: hobbyId,
      p_hobby_id: hobbyId,
      p_level: 'new',
      p_tree: {},
      p_mascot_set: 'explorer',
      p_model: 'test',
      p_goal_class: 'none',
    })
    const slotOf = async (hobbyId: string): Promise<number> => {
      const res = await user.client.from('paths').select('color_slot').eq('hobby_id', hobbyId).single()
      if (res.error) throw new Error(res.error.message)
      return (res.data as { color_slot: number }).color_slot
    }
    for (const hobbyId of ['one', 'two', 'three']) {
      const res = await user.client.rpc('save_generated_path', args(hobbyId))
      if (res.error) throw new Error(res.error.message)
    }
    const before = [await slotOf('one'), await slotOf('two'), await slotOf('three')]
    expect([...before].sort()).toEqual([1, 2, 3])
    // Re-generating the first hobby takes the conflict branch.
    const again = await user.client.rpc('save_generated_path', args('one'))
    if (again.error) throw new Error(again.error.message)
    expect([await slotOf('one'), await slotOf('two'), await slotOf('three')]).toEqual(before)
  }, 60_000)

  it("does not see another user's paths", async () => {
    const a = await signedInUser()
    const b = await signedInUser()
    expect(await insertPath(a, 'x', BASE)).toBe(1)
    expect(await insertPath(a, 'y', BASE + 1000)).toBe(2)
    expect(await insertPath(b, 'x', BASE + 2000)).toBe(1)
  }, 60_000)
})
