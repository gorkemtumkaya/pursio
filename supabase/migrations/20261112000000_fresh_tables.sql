-- fresh: server-only tables and functions for Channel_Sources, Fresh_Items and check state.
-- Apply after 20261110000300_video_drain_cron.sql.
--
-- Only the service role reaches these tables. RLS is on with no policies, and anon and
-- authenticated have no table privileges (same pattern as 20261110000100_video_pipeline.sql).
-- Every function is security definer with search_path = public and executable by
-- service_role only; fresh_sources_refresh, fresh_lease_key and fresh_qualifying_counts are
-- executable by no role and are called only from the functions below.
--
-- Normalization stays in TypeScript (design Decision 5). SQL never normalizes a hobby or a
-- Skill title and never maps a language: Pool_Keys already hold Normalized parts and the
-- Language_Code, and fresh_active_hobbies returns profiles.language as stored (null
-- included). The TypeScript side (shared/utils/fresh-keys.ts, languageCode) maps a missing,
-- empty or whitespace-only language to 'en' (decision D15).
--
-- Tie-breaks on ids and names use collate "C" (code point order), the same order as
-- compareCodePoints in shared/utils/fresh-keys.ts.
--
-- Dependency: fresh_active_hobbies reads paths.last_opened_at, which
-- 20261112000100_fresh_user.sql adds. The function is plpgsql, so the column is resolved
-- when the function first runs, not when it is created. Apply both migrations before the
-- Check_Route is called.

-- ---------------------------------------------------------------------------------------
-- Check_Key parts of each pool, written by video_pool_store from the Pool_Key
-- ["hobby", "skill title", level, "language"] (already Normalized and reduced).
-- ---------------------------------------------------------------------------------------

alter table public.video_pools
  add column hobby_norm text,
  add column skill_norm text,
  add column language   text;

-- Every Pool_Key is the JSON array written by poolKey() in shared/utils/video-normalize.ts.
update public.video_pools
set hobby_norm = (pool_key::jsonb) ->> 0,
    skill_norm = (pool_key::jsonb) ->> 1,
    language   = (pool_key::jsonb) ->> 3
where left(pool_key, 1) = '[';

create index video_pools_check_key   on public.video_pools (hobby_norm, language);
create index video_pools_hobby_stored on public.video_pools (hobby_norm, stored_at desc);

-- ---------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------

-- At most 15 rows per Check_Key (hobby_norm, language), kept by fresh_sources_refresh.
create table public.fresh_channel_sources (
  hobby_norm           text not null,
  language             text not null,
  channel_id           text not null check (char_length(channel_id) between 1 and 64),
  channel_name         text not null,
  qualifying_count     integer not null check (qualifying_count > 0),
  latest_qualifying_at timestamptz not null,
  last_checked_at      timestamptz,
  primary key (hobby_norm, language, channel_id)
);

create table public.fresh_items (
  hobby_norm   text not null,
  language     text not null,
  video_id     text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  skill_norm   text not null,
  level        text not null check (level in ('beginner', 'intermediate', 'advanced')),
  channel_id   text not null check (char_length(channel_id) between 1 and 64),
  -- title, channel, thumbnailUrl, durationSeconds, style, teachesThisSkill, levelFit
  video        jsonb not null check (jsonb_typeof(video) = 'object'),
  why          text not null check (char_length(why) between 1 and 120),
  published_at timestamptz not null,
  found_at     timestamptz not null default now(),
  primary key (hobby_norm, language, video_id)
);

create index fresh_items_page  on public.fresh_items (hobby_norm, language, published_at desc);
create index fresh_items_found on public.fresh_items (found_at);

create table public.fresh_check_state (
  hobby_norm      text not null,
  language        text not null,
  last_success_at timestamptz,          -- finish time of the last successful Fresh_Check
  last_attempt_at timestamptz,          -- Last_Attempt_Time; never returned to a Client
  primary key (hobby_norm, language)
);

-- Server-only access: RLS on, no policies, no Client role privileges.
alter table public.fresh_channel_sources enable row level security;
alter table public.fresh_items           enable row level security;
alter table public.fresh_check_state     enable row level security;

revoke all on public.fresh_channel_sources, public.fresh_items, public.fresh_check_state
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.fresh_channel_sources, public.fresh_items, public.fresh_check_state
  to service_role;

-- ---------------------------------------------------------------------------------------
-- Internal helpers (no role may execute them directly)
-- ---------------------------------------------------------------------------------------

-- Lease key in video_leases: 'fresh:' || JSON text ["hobby","language"], the same text as
-- freshLeaseKey() in shared/utils/fresh-keys.ts (JSON.stringify with no spaces). to_json
-- escapes text like JSON.stringify does for Normalized hobbies and Language_Codes.
create function public.fresh_lease_key(p_hobby text, p_language text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'fresh:[' || to_json(p_hobby)::text || ',' || to_json(p_language)::text || ']';
$$;

-- Qualifying_Count per channel for one Check_Key (Req 1.3, 1.7): distinct video ids with
-- teachesThisSkill >= 0.7 and a known channel id, over every stored pool of the key.
-- A channel id that does not fit fresh_channel_sources (over 64 characters) is left out,
-- so an odd provider value can never make a pool store fail.
create function public.fresh_qualifying_counts(p_hobby text, p_language text)
returns table (channel_id text, qualifying_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select v ->> 'channelId', count(distinct v ->> 'id')::integer
  from public.video_pools p
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(p.videos) = 'array' then p.videos else '[]'::jsonb end
  ) as e(v)
  where p.hobby_norm = p_hobby
    and p.language = p_language
    and jsonb_typeof(v -> 'teachesThisSkill') = 'number'
    and (v ->> 'teachesThisSkill')::numeric >= 0.7
    and jsonb_typeof(v -> 'channelId') = 'string'
    and char_length(v ->> 'channelId') between 1 and 64
    and jsonb_typeof(v -> 'id') = 'string'
  group by v ->> 'channelId';
$$;

-- Channel_Source upkeep for one Check_Key after a pool of that key was stored (design,
-- Channel_Sources steps 1 to 4; TypeScript mirror: refreshSources in
-- server/utils/fresh/sources.ts). Runs inside video_pool_store, so an error rolls the pool
-- store back too (Req 1.6). p_new_videos is the pool just stored.
create function public.fresh_sources_refresh(p_hobby text, p_language text, p_new_videos jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Serialize upkeep per Check_Key, so two pool stores of the same key (different Skills)
  -- never count from snapshots that miss each other's pool.
  perform pg_advisory_xact_lock(hashtextextended('fresh_sources:' || public.fresh_lease_key(p_hobby, p_language), 0));

  -- Step 2: add or update the channel of every Qualifying_Video of the new pool, with the
  -- channel name of the first such video in pool order and the latest qualifying time set
  -- to the store time. last_checked_at is never touched here (Req 1.1, 1.2).
  insert into public.fresh_channel_sources as s
    (hobby_norm, language, channel_id, channel_name, qualifying_count, latest_qualifying_at, last_checked_at)
  select p_hobby, p_language, n.channel_id, n.channel_name, c.qualifying_count, now(), null
  from (
    select distinct on (v ->> 'channelId')
      v ->> 'channelId' as channel_id,
      coalesce(v ->> 'channel', '') as channel_name
    from jsonb_array_elements(
      case when jsonb_typeof(p_new_videos) = 'array' then p_new_videos else '[]'::jsonb end
    ) with ordinality as e(v, ord)
    where jsonb_typeof(v -> 'teachesThisSkill') = 'number'
      and (v ->> 'teachesThisSkill')::numeric >= 0.7
      and jsonb_typeof(v -> 'channelId') = 'string'
      and char_length(v ->> 'channelId') between 1 and 64
      and jsonb_typeof(v -> 'id') = 'string'
    order by v ->> 'channelId', e.ord
  ) as n
  join public.fresh_qualifying_counts(p_hobby, p_language) as c on c.channel_id = n.channel_id
  on conflict (hobby_norm, language, channel_id) do update
    set channel_name         = excluded.channel_name,
        qualifying_count     = excluded.qualifying_count,
        latest_qualifying_at = excluded.latest_qualifying_at;

  -- Step 3: remove sources whose count is now 0 (Req 1.4), then recount the others (Req 1.3).
  delete from public.fresh_channel_sources s
  where s.hobby_norm = p_hobby
    and s.language = p_language
    and not exists (
      select 1 from public.fresh_qualifying_counts(p_hobby, p_language) c
      where c.channel_id = s.channel_id
    );

  update public.fresh_channel_sources s
  set qualifying_count = c.qualifying_count
  from public.fresh_qualifying_counts(p_hobby, p_language) c
  where s.hobby_norm = p_hobby
    and s.language = p_language
    and s.channel_id = c.channel_id
    and s.qualifying_count <> c.qualifying_count;

  -- Step 4: keep the top 15 (Req 1.5).
  delete from public.fresh_channel_sources s
  using (
    select r.channel_id,
           row_number() over (
             order by r.qualifying_count desc, r.latest_qualifying_at desc, r.channel_id collate "C" asc
           ) as rank
    from public.fresh_channel_sources r
    where r.hobby_norm = p_hobby and r.language = p_language
  ) as ranked
  where s.hobby_norm = p_hobby
    and s.language = p_language
    and s.channel_id = ranked.channel_id
    and ranked.rank > 15;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Pool store (replaced)
-- ---------------------------------------------------------------------------------------

-- Store a finished pool. Behavior of 20261110000100 is kept: only the run that still owns
-- the lease may store (a late run that lost the lease gets false); on success the lease and
-- any queued fill for the key are deleted. New: the Check_Key columns are written from the
-- Pool_Key, and the Channel_Sources of that Check_Key are refreshed, all in the same
-- transaction (Req 1.1 to 1.8). A key that is not a 4-part Pool_Key stores as before with
-- null key columns and no Channel_Source upkeep.
create or replace function public.video_pool_store(p_key text, p_run uuid, p_videos jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner    uuid;
  v_parts    jsonb;
  v_hobby    text;
  v_skill    text;
  v_language text;
begin
  select run_id into v_owner from public.video_leases where pool_key = p_key for update;
  if v_owner is null or v_owner <> p_run then
    return false;
  end if;

  begin
    v_parts := p_key::jsonb;
  exception when others then
    v_parts := null;
  end;
  if jsonb_typeof(v_parts) = 'array'
     and jsonb_array_length(v_parts) = 4
     and jsonb_typeof(v_parts -> 0) = 'string'
     and jsonb_typeof(v_parts -> 1) = 'string'
     and jsonb_typeof(v_parts -> 3) = 'string' then
    v_hobby    := v_parts ->> 0;
    v_skill    := v_parts ->> 1;
    v_language := v_parts ->> 3;
  end if;

  insert into public.video_pools (pool_key, videos, stored_at, run_id, hobby_norm, skill_norm, language)
  values (p_key, p_videos, now(), p_run, v_hobby, v_skill, v_language)
  on conflict (pool_key) do update
    set videos     = excluded.videos,
        stored_at  = excluded.stored_at,
        run_id     = excluded.run_id,
        hobby_norm = excluded.hobby_norm,
        skill_norm = excluded.skill_norm,
        language   = excluded.language;
  delete from public.video_leases where pool_key = p_key;
  delete from public.video_fills where pool_key = p_key;

  if v_hobby is not null and v_language is not null then
    perform public.fresh_sources_refresh(v_hobby, v_language, p_videos);
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Check_Route functions
-- ---------------------------------------------------------------------------------------

-- Delete Fresh_Items whose found time is Fresh_Retention (2592000 s) or more in the past
-- (Req 7.4). Returns the number of deleted rows.
create function public.fresh_items_cleanup()
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.fresh_items
    where found_at <= now() - interval '2592000 seconds'
    returning 1
  )
  select count(*)::integer from deleted;
$$;

-- Raw hobby text and profile language of every non-archived path that was opened or had
-- progress saved in the last 1209600 s (Req 3.7). The language is returned as stored, null
-- included, with no coalesce: TypeScript maps a missing one to 'en' (Req 3.16, D15).
create function public.fresh_active_hobbies()
returns table (hobby text, language text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  return query
  select distinct p.hobby, pr.language
  from public.paths p
  left join public.progress g on g.path_id = p.id
  left join public.profiles pr on pr.id = p.user_id
  where not p.archived
    and greatest(p.last_opened_at, g.updated_at) > now() - interval '1209600 seconds';
end;
$$;

-- Check state of the given keys plus the db time, as one object:
--   { "nowMs": <epoch ms>, "states": [{ "hobby", "language", "lastSuccessMs", "lastAttemptMs" }] }
-- p_keys is a JSON array of { "hobby": <Normalized hobby>, "language": <Language_Code> }.
-- One state per requested key, in request order; times are null when never set.
create function public.fresh_check_states(p_keys jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_keys is null or jsonb_typeof(p_keys) <> 'array' then
    raise exception 'bad_arguments' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'nowMs', (extract(epoch from now()) * 1000)::bigint,
    'states', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'hobby', e.v ->> 'hobby',
          'language', e.v ->> 'language',
          'lastSuccessMs', (extract(epoch from s.last_success_at) * 1000)::bigint,
          'lastAttemptMs', (extract(epoch from s.last_attempt_at) * 1000)::bigint
        )
        order by e.ord
      )
      from jsonb_array_elements(p_keys) with ordinality as e(v, ord)
      left join public.fresh_check_state s
        on s.hobby_norm = e.v ->> 'hobby' and s.language = e.v ->> 'language'
      where jsonb_typeof(e.v -> 'hobby') = 'string'
        and jsonb_typeof(e.v -> 'language') = 'string'
    ), '[]'::jsonb)
  );
end;
$$;

-- Take the Fresh Lease of a Check_Key (300 s, video_lease_take logic on the key
-- fresh_lease_key) and, when taken, record the Last_Attempt_Time in the same transaction
-- (Req 3.9, 3.12, 7.5). Returns the db start time as epoch ms, or null when the Lease is
-- held and not expired (then no Last_Attempt_Time is recorded).
create function public.fresh_lease_take(p_hobby text, p_language text, p_run uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_hobby is null or p_language is null or p_run is null then
    raise exception 'bad_arguments' using errcode = '22023';
  end if;
  if not public.video_lease_take(public.fresh_lease_key(p_hobby, p_language), p_run, 300) then
    return null;
  end if;
  insert into public.fresh_check_state as s (hobby_norm, language, last_attempt_at)
  values (p_hobby, p_language, now())
  on conflict (hobby_norm, language) do update set last_attempt_at = excluded.last_attempt_at;
  return (extract(epoch from now()) * 1000)::bigint;
end;
$$;

-- Channel_Sources of one Check_Key for a Fresh_Check, in rank order (Req 1.5).
create function public.fresh_sources_of(p_hobby text, p_language text)
returns table (
  channel_id text,
  channel_name text,
  qualifying_count integer,
  latest_qualifying_ms bigint,
  last_checked_ms bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select s.channel_id,
         s.channel_name,
         s.qualifying_count,
         (extract(epoch from s.latest_qualifying_at) * 1000)::bigint,
         (extract(epoch from s.last_checked_at) * 1000)::bigint
  from public.fresh_channel_sources s
  where s.hobby_norm = p_hobby and s.language = p_language
  order by s.qualifying_count desc, s.latest_qualifying_at desc, s.channel_id collate "C" asc;
$$;

-- The given video ids that are already stored as Fresh_Items for the Check_Key (Req 4.6).
create function public.fresh_stored_ids(p_hobby text, p_language text, p_ids text[])
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select i.video_id
  from public.fresh_items i
  where i.hobby_norm = p_hobby
    and i.language = p_language
    and i.video_id = any(coalesce(p_ids, '{}'::text[]));
$$;

-- Distinct Normalized Skill titles of the stored pools of a hobby in any Language_Code,
-- the most recently stored first, at most 60 (Req 6.2, decision D6).
create function public.fresh_skill_titles(p_hobby text)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select t.skill_norm
  from (
    select p.skill_norm, max(p.stored_at) as latest
    from public.video_pools p
    where p.hobby_norm = p_hobby
      and p.skill_norm is not null
      and p.skill_norm <> ''
    group by p.skill_norm
  ) as t
  order by t.latest desc, t.skill_norm collate "C" asc
  limit 60;
$$;

-- Store a successful Fresh_Check in one transaction (Req 7.1, 7.2, 7.9, 3.15).
--   'deadline_exceeded': the db clock is past p_deadline_ms (the Call_Deadline in db time)
--     at the start; nothing is written. The same check runs again after the writes and then
--     raises the error 'deadline_exceeded', which rolls every write back, so no commit lands
--     after the Call_Deadline. The Postgres store maps that error to the same outcome.
--   'lease_lost': p_run no longer owns the Lease, or the Lease is 300 s old or older.
--   'stored': items inserted with on conflict do nothing (an existing item keeps its found
--     time), last_checked_at = check start for p_channels, last_success_at = now(), Lease
--     deleted.
-- p_items is a JSON array of
--   { "videoId", "skillNorm", "level", "channelId", "why", "publishedMs",
--     "video": { title, channel, thumbnailUrl, durationSeconds, style, teachesThisSkill, levelFit } }.
-- An invalid item (check constraint) raises, which the Postgres store maps to store_failed.
create function public.fresh_check_store(
  p_hobby text,
  p_language text,
  p_run uuid,
  p_started_ms bigint,
  p_deadline_ms bigint,
  p_items jsonb,
  p_channels text[]
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key      text;
  v_deadline timestamptz;
  v_owner    uuid;
  v_taken    timestamptz;
begin
  if p_hobby is null or p_language is null or p_run is null
     or p_started_ms is null or p_deadline_ms is null
     or p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'bad_arguments' using errcode = '22023';
  end if;
  v_key := public.fresh_lease_key(p_hobby, p_language);
  v_deadline := to_timestamp(p_deadline_ms / 1000.0);

  if clock_timestamp() > v_deadline then
    return 'deadline_exceeded';
  end if;

  select l.run_id, l.taken_at into v_owner, v_taken
  from public.video_leases l
  where l.pool_key = v_key
  for update;
  if v_owner is null or v_owner <> p_run or v_taken <= now() - make_interval(secs => 300) then
    return 'lease_lost';
  end if;

  -- Same lock as fresh_sources_refresh, so source rows are never updated in two orders.
  perform pg_advisory_xact_lock(hashtextextended('fresh_sources:' || v_key, 0));

  insert into public.fresh_items
    (hobby_norm, language, video_id, skill_norm, level, channel_id, video, why, published_at, found_at)
  select p_hobby,
         p_language,
         i ->> 'videoId',
         i ->> 'skillNorm',
         i ->> 'level',
         i ->> 'channelId',
         i -> 'video',
         i ->> 'why',
         to_timestamp((i ->> 'publishedMs')::bigint / 1000.0),
         now()
  from jsonb_array_elements(p_items) as e(i)
  on conflict (hobby_norm, language, video_id) do nothing;

  update public.fresh_channel_sources s
  set last_checked_at = to_timestamp(p_started_ms / 1000.0)
  where s.hobby_norm = p_hobby
    and s.language = p_language
    and s.channel_id = any(coalesce(p_channels, '{}'::text[]));

  insert into public.fresh_check_state as s (hobby_norm, language, last_success_at)
  values (p_hobby, p_language, now())
  on conflict (hobby_norm, language) do update set last_success_at = excluded.last_success_at;

  delete from public.video_leases where pool_key = v_key;

  if clock_timestamp() > v_deadline then
    raise exception 'deadline_exceeded' using errcode = 'P0001';
  end if;
  return 'stored';
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Fresh_Endpoint read
-- ---------------------------------------------------------------------------------------

-- One read for the Fresh_Endpoint (Req 7.7, 7.10, 8.1, 8.10). At most 20 Check_Keys
-- (JSON array of { "hobby", "language" }) and 60 Pool_Keys. Returns one object:
--   nowMs:      db time, epoch ms
--   items:      Fresh_Items of the keys published within 7 days and found within 30 days:
--               { hobby, language, videoId, skillNorm, level, channelId, video, why,
--                 publishedMs, foundMs }
--   pools:      { poolKey, videos, storedAtMs } for the Pool_Keys that exist
--   sources:    { hobby, language, channelId, channelName } only (Req 1.9)
--   checkTimes: { hobby, language, lastSuccessMs } for keys with a successful check only;
--               no Last_Attempt_Time, last check time or Lease (Req 7.7)
create function public.fresh_page_read(p_keys jsonb, p_pool_keys text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_keys is null or jsonb_typeof(p_keys) <> 'array' or jsonb_array_length(p_keys) > 20
     or p_pool_keys is null or cardinality(p_pool_keys) > 60 then
    raise exception 'bad_arguments' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'nowMs', (extract(epoch from now()) * 1000)::bigint,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'hobby', i.hobby_norm,
          'language', i.language,
          'videoId', i.video_id,
          'skillNorm', i.skill_norm,
          'level', i.level,
          'channelId', i.channel_id,
          'video', i.video,
          'why', i.why,
          'publishedMs', (extract(epoch from i.published_at) * 1000)::bigint,
          'foundMs', (extract(epoch from i.found_at) * 1000)::bigint
        )
        order by i.hobby_norm collate "C", i.language collate "C",
                 i.published_at desc, i.video_id collate "C"
      )
      from public.fresh_items i
      where (i.hobby_norm, i.language) in (
              select k ->> 'hobby', k ->> 'language' from jsonb_array_elements(p_keys) as k
            )
        and i.published_at > now() - interval '604800 seconds'
        and i.found_at > now() - interval '2592000 seconds'
    ), '[]'::jsonb),
    'pools', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'poolKey', p.pool_key,
          'videos', p.videos,
          'storedAtMs', (extract(epoch from p.stored_at) * 1000)::bigint
        )
        order by p.pool_key collate "C"
      )
      from public.video_pools p
      where p.pool_key = any(p_pool_keys)
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'hobby', s.hobby_norm,
          'language', s.language,
          'channelId', s.channel_id,
          'channelName', s.channel_name
        )
        order by s.hobby_norm collate "C", s.language collate "C",
                 s.qualifying_count desc, s.latest_qualifying_at desc, s.channel_id collate "C"
      )
      from public.fresh_channel_sources s
      where (s.hobby_norm, s.language) in (
              select k ->> 'hobby', k ->> 'language' from jsonb_array_elements(p_keys) as k
            )
    ), '[]'::jsonb),
    'checkTimes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'hobby', c.hobby_norm,
          'language', c.language,
          'lastSuccessMs', (extract(epoch from c.last_success_at) * 1000)::bigint
        )
        order by c.hobby_norm collate "C", c.language collate "C"
      )
      from public.fresh_check_state c
      where c.last_success_at is not null
        and (c.hobby_norm, c.language) in (
              select k ->> 'hobby', k ->> 'language' from jsonb_array_elements(p_keys) as k
            )
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------------------

revoke execute on function public.fresh_lease_key(text, text) from public, anon, authenticated, service_role;
revoke execute on function public.fresh_qualifying_counts(text, text) from public, anon, authenticated, service_role;
revoke execute on function public.fresh_sources_refresh(text, text, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.video_pool_store(text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.fresh_items_cleanup() from public, anon, authenticated;
revoke execute on function public.fresh_active_hobbies() from public, anon, authenticated;
revoke execute on function public.fresh_check_states(jsonb) from public, anon, authenticated;
revoke execute on function public.fresh_lease_take(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.fresh_sources_of(text, text) from public, anon, authenticated;
revoke execute on function public.fresh_stored_ids(text, text, text[]) from public, anon, authenticated;
revoke execute on function public.fresh_skill_titles(text) from public, anon, authenticated;
revoke execute on function public.fresh_check_store(text, text, uuid, bigint, bigint, jsonb, text[]) from public, anon, authenticated;
revoke execute on function public.fresh_page_read(jsonb, text[]) from public, anon, authenticated;

grant execute on function public.video_pool_store(text, uuid, jsonb) to service_role;
grant execute on function public.fresh_items_cleanup() to service_role;
grant execute on function public.fresh_active_hobbies() to service_role;
grant execute on function public.fresh_check_states(jsonb) to service_role;
grant execute on function public.fresh_lease_take(text, text, uuid) to service_role;
grant execute on function public.fresh_sources_of(text, text) to service_role;
grant execute on function public.fresh_stored_ids(text, text, text[]) to service_role;
grant execute on function public.fresh_skill_titles(text) to service_role;
grant execute on function public.fresh_check_store(text, text, uuid, bigint, bigint, jsonb, text[]) to service_role;
grant execute on function public.fresh_page_read(jsonb, text[]) to service_role;

-- Rollback (run by hand; restores the video_pool_store of 20261110000100 first):
-- create or replace function public.video_pool_store(p_key text, p_run uuid, p_videos jsonb)
--   ... body from 20261110000100_video_pipeline.sql ...
-- drop function public.fresh_page_read(jsonb, text[]);
-- drop function public.fresh_check_store(text, text, uuid, bigint, bigint, jsonb, text[]);
-- drop function public.fresh_skill_titles(text);
-- drop function public.fresh_stored_ids(text, text, text[]);
-- drop function public.fresh_sources_of(text, text);
-- drop function public.fresh_lease_take(text, text, uuid);
-- drop function public.fresh_check_states(jsonb);
-- drop function public.fresh_active_hobbies();
-- drop function public.fresh_items_cleanup();
-- drop function public.fresh_sources_refresh(text, text, jsonb);
-- drop function public.fresh_qualifying_counts(text, text);
-- drop function public.fresh_lease_key(text, text);
-- delete from public.video_leases where pool_key like 'fresh:%';
-- drop table public.fresh_check_state;
-- drop table public.fresh_items;
-- drop table public.fresh_channel_sources;
-- drop index public.video_pools_hobby_stored;
-- drop index public.video_pools_check_key;
-- alter table public.video_pools drop column language, drop column skill_norm, drop column hobby_norm;
