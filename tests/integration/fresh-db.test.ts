/**
 * Database integration tests for the Fresh migrations (spec: fresh, task 8.4).
 *
 * Runs only against a LOCAL Supabase stack (for example `supabase start`), through
 * PostgREST with @supabase/supabase-js, so the anon, authenticated and service_role
 * grants and the RLS policies are exercised exactly as the app uses them. Set:
 *
 *   SUPABASE_TEST_URL               local API URL, e.g. http://127.0.0.1:54321
 *   SUPABASE_TEST_ANON_KEY          the local anon key (`supabase status`)
 *   SUPABASE_TEST_SERVICE_ROLE_KEY  the local service_role key (`supabase status`)
 *
 * The suite is skipped when any of them is missing, or when the URL host is not a
 * loopback or local Docker host, so it can never reach a remote or production database.
 * It needs every migration in supabase/migrations applied (`supabase db reset`).
 *
 * Covers Requirements 1.6, 1.9, 2.4, 7.7, 19.1 and 19.16.
 */
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ChannelMute, SaveSnapshot } from '../../shared/types/fresh'
import type { PoolVideo, VideoEvent, VideoSource, VideoStyle } from '../../shared/types/video'
import { mergeMuteLists, serializeMute } from '../../shared/utils/channel-mutes'
import { compareCodePoints } from '../../shared/utils/fresh-keys'
import { mergeEvents, serializeEvent } from '../../shared/utils/video-events'
import { type ChannelSourceRow, rankChannelSources, refreshSources } from '../../server/utils/fresh/sources'

// ---------------------------------------------------------------------------------------
// Configuration: local database only
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
  if (!LOCAL_HOSTS.has(host)) {
    console.warn(`fresh-db: SUPABASE_TEST_URL host "${host}" is not local; the suite is skipped.`)
    return null
  }
  return { url, anonKey, serviceKey }
}

const config = testDbConfig()

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const

function client(key: string): SupabaseClient {
  if (!config) throw new Error('no test database')
  return createClient(config.url, key, { auth: NO_SESSION })
}

/** Unique per test file run, so parallel or repeated runs never share rows. */
const RUN = randomUUID().slice(0, 8)
const HOBBY_PREFIX = `itest-${RUN}-`
let hobbyCounter = 0
const nextHobby = (): string => `${HOBBY_PREFIX}${hobbyCounter++}`

/**
 * Epoch microseconds of a PostgREST timestamptz ("2026-01-15T12:00:00.123456+00:00").
 * Microseconds keep the order Postgres sees, which millisecond rounding could merge.
 */
function toMicros(iso: string): number {
  const m = /^(.+T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(iso)
  if (!m) throw new Error(`unexpected timestamp ${iso}`)
  const tz = m[3]!.length === 3 ? `${m[3]}:00` : m[3]!
  const seconds = Date.parse(`${m[1]}${tz}`)
  if (Number.isNaN(seconds)) throw new Error(`unexpected timestamp ${iso}`)
  const fraction = Number((m[2] ?? '').padEnd(6, '0').slice(0, 6))
  return seconds * 1000 + fraction
}

const toMs = (iso: string | null): number | null => (iso === null ? null : Math.round(toMicros(iso) / 1000))

/** The rows of a PostgREST result, or a thrown error naming the step. */
function rowsOf<T>(step: string, res: { data: unknown; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(`${step}: ${res.error.message}`)
  return (res.data ?? []) as T[]
}

// ---------------------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------------------

describe.skipIf(config === null)('fresh database (local Supabase)', () => {
  let service: SupabaseClient
  let anon: SupabaseClient
  const users: { id: string; client: SupabaseClient }[] = []

  async function signedInUser(): Promise<{ id: string; client: SupabaseClient }> {
    const email = `fresh-itest-${RUN}-${users.length}@example.test`
    const password = `pw-${randomUUID()}`
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`)
    const c = client(config!.anonKey)
    const signedIn = await c.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw new Error(`signIn: ${signedIn.error.message}`)
    const user = { id: created.data.user.id, client: c }
    users.push(user)
    return user
  }

  let userA: { id: string; client: SupabaseClient }
  let userB: { id: string; client: SupabaseClient }

  beforeAll(async () => {
    service = client(config!.serviceKey)
    anon = client(config!.anonKey)
    userA = await signedInUser()
    userB = await signedInUser()
  }, 60_000)

  afterAll(async () => {
    if (!service) return
    const like = `${HOBBY_PREFIX}%`
    await service.from('fresh_items').delete().like('hobby_norm', like)
    await service.from('fresh_channel_sources').delete().like('hobby_norm', like)
    await service.from('fresh_check_state').delete().like('hobby_norm', like)
    await service.from('video_pools').delete().like('hobby_norm', like)
    await service.from('video_leases').delete().like('pool_key', `%${HOBBY_PREFIX}%`)
    // Deleting the users cascades to their channel_mutes and video_events.
    for (const u of users) await service.auth.admin.deleteUser(u.id)
  }, 60_000)

  // -------------------------------------------------------------------------------------
  // Server-only tables (Req 1.9, 7.7, 19.16)
  // -------------------------------------------------------------------------------------

  describe('server-only tables deny every Client role', () => {
    const hobby = nextHobby()
    const leaseKey = `fresh:["${hobby}","en"]`
    const nowIso = new Date().toISOString()

    const seeds: Record<string, { row: Record<string, unknown>; match: Record<string, string> }> = {
      fresh_items: {
        row: {
          hobby_norm: hobby,
          language: 'en',
          video_id: 'AAAAAAAAAAA',
          skill_norm: 'basics',
          level: 'beginner',
          channel_id: 'UCseed',
          video: { title: 'Seed' },
          why: 'Seed row',
          published_at: nowIso,
        },
        match: { hobby_norm: hobby, language: 'en' },
      },
      fresh_channel_sources: {
        row: {
          hobby_norm: hobby,
          language: 'en',
          channel_id: 'UCseed',
          channel_name: 'Seed',
          qualifying_count: 1,
          latest_qualifying_at: nowIso,
        },
        match: { hobby_norm: hobby, language: 'en' },
      },
      fresh_check_state: {
        row: { hobby_norm: hobby, language: 'en', last_success_at: nowIso, last_attempt_at: nowIso },
        match: { hobby_norm: hobby, language: 'en' },
      },
      video_leases: {
        row: { pool_key: leaseKey, run_id: randomUUID() },
        match: { pool_key: leaseKey },
      },
    }

    /** A second row a Client tries to insert; only its key differs from the seed. */
    function intruder(table: string): Record<string, unknown> {
      const { row } = seeds[table]!
      return table === 'video_leases'
        ? { ...row, pool_key: `${leaseKey}:intruder` }
        : { ...row, language: 'xx' }
    }

    beforeAll(async () => {
      for (const [table, { row }] of Object.entries(seeds)) {
        rowsOf(`seed ${table}`, await service.from(table).insert(row))
      }
    }, 30_000)

    for (const table of Object.keys(seeds)) {
      it(`${table}: anon and authenticated can neither read nor write`, async () => {
        const { match } = seeds[table]!
        const before = rowsOf<Record<string, unknown>>('read seed', await service.from(table).select('*').match(match))
        expect(before).toHaveLength(1)

        for (const [role, c] of [['anon', anon], ['authenticated', userA.client]] as const) {
          const read = await c.from(table).select('*').match(match)
          expect(read.error, `${role} select ${table}`).not.toBeNull()
          expect(read.data ?? []).toHaveLength(0)

          const insert = await c.from(table).insert(intruder(table))
          expect(insert.error, `${role} insert ${table}`).not.toBeNull()

          const update = await c.from(table).update({ [Object.keys(match)[0]!]: `${hobby}-changed` }).match(match)
          expect(update.error, `${role} update ${table}`).not.toBeNull()

          const del = await c.from(table).delete().match(match)
          expect(del.error, `${role} delete ${table}`).not.toBeNull()
        }

        const after = rowsOf<Record<string, unknown>>('read seed', await service.from(table).select('*').match(match))
        expect(after).toEqual(before)
        const intruderKey = table === 'video_leases' ? { pool_key: `${leaseKey}:intruder` } : { hobby_norm: hobby, language: 'xx' }
        const intruders = rowsOf('read intruder', await service.from(table).select('*').match(intruderKey))
        expect(intruders).toHaveLength(0)
      }, 30_000)
    }

    it('Client roles cannot call the Fresh server functions', async () => {
      const calls: [string, Record<string, unknown>][] = [
        ['fresh_check_states', { p_keys: [{ hobby, language: 'en' }] }],
        ['fresh_page_read', { p_keys: [{ hobby, language: 'en' }], p_pool_keys: [] }],
        ['fresh_sources_of', { p_hobby: hobby, p_language: 'en' }],
        ['fresh_lease_take', { p_hobby: hobby, p_language: 'en', p_run: randomUUID() }],
        ['video_pool_store', { p_key: leaseKey, p_run: randomUUID(), p_videos: [] }],
        ['fresh_sources_refresh', { p_hobby: hobby, p_language: 'en', p_new_videos: [] }],
      ]
      for (const [fn, args] of calls) {
        for (const [role, c] of [['anon', anon], ['authenticated', userA.client]] as const) {
          const res = await c.rpc(fn, args)
          expect(res.error, `${role} rpc ${fn}`).not.toBeNull()
        }
      }
      // fresh_sources_refresh is executable by no role, the service role included.
      const direct = await service.rpc('fresh_sources_refresh', { p_hobby: hobby, p_language: 'en', p_new_videos: [] })
      expect(direct.error).not.toBeNull()
    }, 30_000)
  })

  // -------------------------------------------------------------------------------------
  // Owner-only user data (Req 2.4, 19.16)
  // -------------------------------------------------------------------------------------

  describe('owner-only user data', () => {
    it('channel_mutes are readable and writable by their owner only', async () => {
      const channelId = `UCowner-${RUN}`
      const changedAt = Date.UTC(2026, 10, 12, 12)
      rowsOf('A merge', await userA.client.rpc('merge_channel_mutes', { p_rows: [{ channelId, muted: true, changedAt }] }))

      // B sees and changes nothing of A's.
      expect(rowsOf('B select', await userB.client.from('channel_mutes').select('*').eq('channel_id', channelId))).toHaveLength(0)
      expect(rowsOf('B update', await userB.client.from('channel_mutes').update({ muted: false }).eq('channel_id', channelId).select())).toHaveLength(0)
      expect(rowsOf('B delete', await userB.client.from('channel_mutes').delete().eq('channel_id', channelId).select())).toHaveLength(0)
      const forged = await userB.client.from('channel_mutes').insert({
        user_id: userA.id,
        channel_id: `${channelId}-forged`,
        muted: true,
        changed_at: new Date(changedAt).toISOString(),
      })
      expect(forged.error).not.toBeNull()
      // A user id in the merge payload is ignored: the row is B's own.
      rowsOf('B merge', await userB.client.rpc('merge_channel_mutes', {
        p_rows: [{ channelId, muted: false, changedAt: changedAt + 1, userId: userA.id }],
      }))

      // Anon has no access at all.
      expect((await anon.from('channel_mutes').select('*').eq('channel_id', channelId)).error).not.toBeNull()
      expect((await anon.rpc('merge_channel_mutes', { p_rows: [{ channelId, muted: false, changedAt }] })).error).not.toBeNull()

      const aRows = rowsOf<{ user_id: string; muted: boolean; changed_at: string }>(
        'A select', await userA.client.from('channel_mutes').select('*').eq('channel_id', channelId),
      )
      expect(aRows.map(r => ({ user: r.user_id, muted: r.muted, changedAt: toMs(r.changed_at) })))
        .toEqual([{ user: userA.id, muted: true, changedAt }])
      const bRows = rowsOf<{ user_id: string; muted: boolean }>(
        'B select', await userB.client.from('channel_mutes').select('*').eq('channel_id', channelId),
      )
      expect(bRows.map(r => ({ user: r.user_id, muted: r.muted }))).toEqual([{ user: userB.id, muted: false }])
      const all = rowsOf('service select', await service.from('channel_mutes').select('user_id').eq('channel_id', `${channelId}-forged`))
      expect(all).toHaveLength(0)
    }, 30_000)

    it('video_events.snapshot and snapshot_at are readable and writable by their owner only', async () => {
      const videoId = `own${RUN}`
      const at = Date.UTC(2026, 10, 12, 12)
      const snapshot: SaveSnapshot = {
        videoId, title: 'Owner only', channel: 'Chan', channelId: 'UCown', thumbnailUrl: 'https://i/x.jpg', durationSeconds: 90,
      }
      const event: VideoEvent = {
        videoId, source: 'feed', playedAt: null, watchedSeconds: 0, finished: false,
        saved: true, savedAt: at, skipped: false, snapshot, snapshotAt: at, updatedAt: at,
      }
      rowsOf('A merge', await userA.client.rpc('merge_video_events', { p_rows: [serializeEvent(event)] }))

      expect(rowsOf('B select', await userB.client.from('video_events').select('snapshot, snapshot_at').eq('video_id', videoId))).toHaveLength(0)
      expect(rowsOf('B update', await userB.client.from('video_events')
        .update({ snapshot: null, snapshot_at: null }).eq('video_id', videoId).select())).toHaveLength(0)
      const forged = await userB.client.from('video_events').insert({
        user_id: userA.id, video_id: videoId, source: 'skill_sheet', snapshot, snapshot_at: new Date(at).toISOString(),
      })
      expect(forged.error).not.toBeNull()
      expect((await anon.from('video_events').select('snapshot, snapshot_at').eq('video_id', videoId)).error).not.toBeNull()

      const aRows = rowsOf<{ source: string; snapshot: unknown; snapshot_at: string | null }>(
        'A select', await userA.client.from('video_events').select('source, snapshot, snapshot_at').eq('video_id', videoId),
      )
      expect(aRows.map(r => ({ source: r.source, snapshot: r.snapshot, snapshotAt: toMs(r.snapshot_at) })))
        .toEqual([{ source: 'feed', snapshot, snapshotAt: at }])
    }, 30_000)
  })

  // -------------------------------------------------------------------------------------
  // SQL merges match their TypeScript mirrors (Req 2.4, 19.16)
  // -------------------------------------------------------------------------------------

  describe('SQL merges match the TypeScript merges on generated rows', () => {
    const DB_RUNS = { numRuns: 15 }
    const BASE = Date.UTC(2026, 10, 12, 12)
    // Few distinct times, so equal times and ties are frequent.
    const arbTime = fc.integer({ min: 0, max: 4 }).map(n => BASE + n * 1000)

    // Channel ids valid on both sides: 1 to 64 UTF-16 units (an emoji counts 2 in both).
    const MUTE_IDS = ['UCa', 'UCb', 'UCB', 'é', '\u{1F600}'.repeat(32), 'C'.repeat(64)]
    const arbMute: fc.Arbitrary<ChannelMute> = fc.record({
      channelId: fc.constantFrom(...MUTE_IDS),
      muted: fc.boolean(),
      changedAt: arbTime,
    })

    it('merge_channel_mutes matches mergeMuteLists', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(arbMute, { maxLength: 6 }), fc.array(arbMute, { maxLength: 6 }), async (first, second) => {
          rowsOf('reset', await userA.client.from('channel_mutes').delete().in('channel_id', MUTE_IDS))
          rowsOf('merge 1', await userA.client.rpc('merge_channel_mutes', { p_rows: first.map(serializeMute) }))
          rowsOf('merge 2', await userA.client.rpc('merge_channel_mutes', { p_rows: second.map(serializeMute) }))
          const rows = rowsOf<{ channel_id: string; muted: boolean; changed_at: string }>(
            'read', await userA.client.from('channel_mutes').select('channel_id, muted, changed_at').in('channel_id', MUTE_IDS),
          )
          const actual = rows
            .map(r => ({ channelId: r.channel_id, muted: r.muted, changedAt: toMs(r.changed_at) }))
            .sort((x, y) => compareCodePoints(x.channelId, y.channelId))
          expect(actual).toEqual(mergeMuteLists(first, second))
        }),
        DB_RUNS,
      )
    }, 120_000)

    // A tiny alphabet with U+001F, so snapshots often share canonical text, sometimes from
    // different fields (the field-level tie-break).
    const arbTiny = fc.string({ unit: fc.constantFrom('a', 'b', '\u001f'), maxLength: 3 })
    const arbSnapshot = (videoId: string): fc.Arbitrary<SaveSnapshot> => fc.record({
      videoId: fc.constantFrom(videoId, `${videoId}\u001f`, `${videoId}a`),
      title: arbTiny,
      channel: arbTiny,
      channelId: fc.option(fc.string({ unit: fc.constantFrom('a', '\u001f'), minLength: 1, maxLength: 2 }), { nil: null }),
      thumbnailUrl: arbTiny,
      durationSeconds: fc.integer({ min: 0, max: 2 }),
    })
    const EVENT_VIDEOS = [`ev1${RUN}`, `ev2${RUN}`]
    const arbSource: fc.Arbitrary<VideoSource> = fc.constantFrom('skill_sheet', 'feed')
    /** A valid record, as parseEvent returns: snapshot and snapshotAt both null or both set. */
    const arbEvent: fc.Arbitrary<VideoEvent> = fc
      .tuple(fc.constantFrom(...EVENT_VIDEOS), arbSource)
      .chain(([videoId, source]) => fc.record({
        playedAt: fc.option(arbTime, { nil: null }),
        watchedSeconds: fc.integer({ min: 0, max: 5 }),
        finished: fc.boolean(),
        saved: fc.boolean(),
        savedAt: fc.option(arbTime, { nil: null }),
        skipped: fc.boolean(),
        snap: fc.option(fc.tuple(arbSnapshot(videoId), arbTime), { nil: null }),
        updatedAt: arbTime,
      }).map(({ snap, ...r }): VideoEvent => ({
        videoId,
        source,
        ...r,
        saved: r.savedAt === null ? false : r.saved,
        skipped: r.playedAt === null ? r.skipped : false,
        snapshot: snap === null ? null : snap[0],
        snapshotAt: snap === null ? null : snap[1],
      })))

    interface EventRow {
      video_id: string
      source: VideoSource
      played_at: string | null
      watched_seconds: number
      finished: boolean
      saved: boolean
      saved_at: string | null
      skipped: boolean
      snapshot: SaveSnapshot | null
      snapshot_at: string | null
      updated_at: string
    }

    const fromRow = (r: EventRow): VideoEvent => ({
      videoId: r.video_id,
      source: r.source,
      playedAt: toMs(r.played_at),
      watchedSeconds: r.watched_seconds,
      finished: r.finished,
      saved: r.saved,
      savedAt: toMs(r.saved_at),
      skipped: r.skipped,
      snapshot: r.snapshot === null ? null : {
        videoId: r.snapshot.videoId,
        title: r.snapshot.title,
        channel: r.snapshot.channel,
        channelId: r.snapshot.channelId,
        thumbnailUrl: r.snapshot.thumbnailUrl,
        durationSeconds: r.snapshot.durationSeconds,
      },
      snapshotAt: toMs(r.snapshot_at),
      updatedAt: toMs(r.updated_at)!,
    })

    const eventKey = (e: VideoEvent): string => `${e.source}|${e.videoId}`

    it('merge_video_events matches mergeEvents, snapshot and snapshot_at included', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(arbEvent, { maxLength: 6 }), fc.array(arbEvent, { maxLength: 6 }), async (first, second) => {
          rowsOf('reset', await userA.client.from('video_events').delete().in('video_id', EVENT_VIDEOS))
          rowsOf('merge 1', await userA.client.rpc('merge_video_events', { p_rows: first.map(serializeEvent) }))
          rowsOf('merge 2', await userA.client.rpc('merge_video_events', { p_rows: second.map(serializeEvent) }))
          const rows = rowsOf<EventRow>('read', await userA.client.from('video_events').select('*').in('video_id', EVENT_VIDEOS))

          const expected = new Map<string, VideoEvent>()
          for (const rec of [...first, ...second]) {
            const prev = expected.get(eventKey(rec))
            expected.set(eventKey(rec), prev ? mergeEvents(prev, rec) : rec)
          }
          const actual = new Map(rows.map(fromRow).map(e => [eventKey(e), e]))
          expect(actual).toEqual(expected)
        }),
        DB_RUNS,
      )
    }, 120_000)
  })

  // -------------------------------------------------------------------------------------
  // Channel_Source upkeep through video_pool_store (Req 1.6, 19.1, 19.16)
  // -------------------------------------------------------------------------------------

  describe('Channel_Source upkeep in video_pool_store', () => {
    interface SourceRow {
      channel_id: string
      channel_name: string
      qualifying_count: number
      latest_qualifying_at: string
      last_checked_at: string | null
    }

    async function sourcesOf(hobby: string): Promise<SourceRow[]> {
      return rowsOf<SourceRow>('read sources', await service.from('fresh_channel_sources')
        .select('channel_id, channel_name, qualifying_count, latest_qualifying_at, last_checked_at')
        .eq('hobby_norm', hobby).eq('language', 'en'))
    }

    /** Times in microseconds, the order Postgres compares; refreshSources only compares them. */
    const toSourceRow = (r: SourceRow): ChannelSourceRow => ({
      channelId: r.channel_id,
      channelName: r.channel_name,
      qualifyingCount: r.qualifying_count,
      latestQualifyingMs: toMicros(r.latest_qualifying_at),
      lastCheckedMs: r.last_checked_at === null ? null : toMicros(r.last_checked_at),
    })

    async function storePool(key: string, videos: readonly PoolVideo[] | null): Promise<{ stored: boolean; storedAt: number }> {
      const run = randomUUID()
      const took = await service.rpc('video_lease_take', { p_key: key, p_run: run, p_timeout_s: 300 })
      if (took.error || took.data !== true) throw new Error(`lease: ${took.error?.message ?? 'not taken'}`)
      const res = await service.rpc('video_pool_store', { p_key: key, p_run: run, p_videos: videos })
      if (res.error) throw new Error(`store: ${res.error.message}`)
      const pool = rowsOf<{ stored_at: string }>('read pool', await service.from('video_pools').select('stored_at').eq('pool_key', key))
      return { stored: res.data === true, storedAt: toMicros(pool[0]!.stored_at) }
    }

    const poolKeyOf = (hobby: string, skill: string): string => JSON.stringify([hobby, skill, 'beginner', 'en'])

    // A small channel space so channels repeat and the 15-row cut is reached. Long ids stay
    // ASCII: SQL char_length and JavaScript length agree only on BMP text.
    const CHANNELS = Array.from({ length: 20 }, (_, i) => `UC${String(i).padStart(2, '0')}`)
    const arbChannelId: fc.Arbitrary<string | null> = fc.oneof(
      { weight: 8, arbitrary: fc.constantFrom(...CHANNELS) },
      { weight: 1, arbitrary: fc.constantFrom('UCb', 'UCB', 'é', 'C'.repeat(64)) },
      { weight: 1, arbitrary: fc.constantFrom(null, '', 'D'.repeat(65)) },
    )
    const arbScore = fc.oneof(fc.constantFrom(0.69, 0.7, 0.71, 0, 1), fc.double({ min: 0, max: 1, noNaN: true }))
    const arbStyle: fc.Arbitrary<VideoStyle> = fc.constantFrom('drill', 'technique', 'explainer', 'approachable')
    const arbVideo: fc.Arbitrary<PoolVideo> = fc.record({
      id: fc.constantFrom(...Array.from({ length: 30 }, (_, i) => `vid${String(i).padStart(8, '0')}`)),
      title: fc.string({ maxLength: 6 }),
      channel: fc.string({ maxLength: 6 }),
      channelId: arbChannelId,
      thumbnailUrl: fc.constant('https://i.ytimg.com/vi/x/mqdefault.jpg'),
      durationSeconds: fc.integer({ min: 60, max: 1200 }),
      viewCount: fc.constant(null),
      likeCount: fc.constant(null),
      publishedAt: fc.constant(null),
      defaultAudioLanguage: fc.constant(null),
      hasCaptions: fc.constant(null),
      teachesThisSkill: arbScore,
      levelFit: fc.double({ min: 0, max: 1, noNaN: true }),
      style: arbStyle,
      matchedQuestText: fc.constant(null),
    })
    // Stores to three Skills of one Check_Key, so pools are both added and replaced.
    const arbStores = fc.array(
      fc.record({ skill: fc.constantFrom('basics', 'footwork', 'reading routes'), videos: fc.array(arbVideo, { maxLength: 12 }) }),
      { minLength: 1, maxLength: 4 },
    )

    it('fresh_sources_refresh (via video_pool_store) matches refreshSources', async () => {
      await fc.assert(
        fc.asyncProperty(arbStores, async (stores) => {
          const hobby = nextHobby()
          const pools = new Map<string, readonly PoolVideo[]>()
          for (const { skill, videos } of stores) {
            const key = poolKeyOf(hobby, skill)
            const existing = (await sourcesOf(hobby)).map(toSourceRow)
            const others = [...pools].filter(([k]) => k !== key).map(([, v]) => v)
            const { stored, storedAt } = await storePool(key, videos)
            expect(stored).toBe(true)
            pools.set(key, videos)
            const expected = refreshSources(existing, others, videos, storedAt)
            const actual = rankChannelSources((await sourcesOf(hobby)).map(toSourceRow))
            expect(actual).toEqual(expected)
          }
        }),
        { numRuns: 10 },
      )
    }, 180_000)

    it('a failed pool store adds no Channel_Source and leaves the existing ones unchanged', async () => {
      const hobby = nextHobby()
      const video = (id: string, channelId: string, score: number): PoolVideo => ({
        id, title: id, channel: `name ${channelId}`, channelId, thumbnailUrl: 'https://i.ytimg.com/vi/x/mqdefault.jpg',
        durationSeconds: 300, viewCount: null, likeCount: null, publishedAt: null, defaultAudioLanguage: null,
        hasCaptions: null, teachesThisSkill: score, levelFit: 0.8, style: 'technique', matchedQuestText: null,
      })
      const first = await storePool(poolKeyOf(hobby, 'basics'), [video('vid00000001', 'UCkept', 0.7), video('vid00000002', 'UClow', 0.69)])
      expect(first.stored).toBe(true)
      const before = await sourcesOf(hobby)
      // 0.7 adds a source, 0.69 does not.
      expect(before.map(r => r.channel_id)).toEqual(['UCkept'])

      // 1. The store raises inside its transaction (videos null violates video_pools.videos
      //    not null): it rolls back and leaves no pool and no source behind.
      const failingKey = poolKeyOf(hobby, 'footwork')
      const run = randomUUID()
      const took = await service.rpc('video_lease_take', { p_key: failingKey, p_run: run, p_timeout_s: 300 })
      expect(took.data).toBe(true)
      const failed = await service.rpc('video_pool_store', { p_key: failingKey, p_run: run, p_videos: null })
      expect(failed.error).not.toBeNull()
      expect(rowsOf('read pool', await service.from('video_pools').select('pool_key').eq('pool_key', failingKey))).toHaveLength(0)
      // The rollback kept the lease, which a successful store deletes.
      const lease = rowsOf<{ run_id: string }>('read lease', await service.from('video_leases').select('run_id').eq('pool_key', failingKey))
      expect(lease.map(l => l.run_id)).toEqual([run])

      // 2. A store by a run that does not own the lease is refused: qualifying videos of a
      //    new channel add nothing.
      const lostKey = poolKeyOf(hobby, 'reading routes')
      const refused = await service.rpc('video_pool_store', {
        p_key: lostKey, p_run: randomUUID(), p_videos: [video('vid00000003', 'UCnew', 0.9)],
      })
      expect(refused.error).toBeNull()
      expect(refused.data).toBe(false)
      expect(rowsOf('read pool', await service.from('video_pools').select('pool_key').eq('pool_key', lostKey))).toHaveLength(0)

      expect(await sourcesOf(hobby)).toEqual(before)
    }, 30_000)
  })
})
