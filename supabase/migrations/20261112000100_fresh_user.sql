-- fresh: per-user data under row-level security.
-- Apply after 20261112000000_fresh_tables.sql.
--
-- 1. paths.last_opened_at and touch_path_opened (Req 3.10). fresh_active_hobbies in
--    20261112000000_fresh_tables.sql reads this column.
-- 2. channel_mutes, owner-only, and merge_channel_mutes (Req 2.3, 2.4, 2.6, 2.10).
-- 3. video_events.snapshot and video_events.snapshot_at, and merge_video_events replaced
--    so the Save_Snapshot merges with its Video_Event (Req 17.10, decision D2).
--
-- The merge functions are security invoker: the owner-only policies decide row access and
-- user_id is always auth.uid(). They must stay in step with their TypeScript mirrors,
-- mergeMute in shared/utils/channel-mutes.ts and mergeEvents in shared/utils/video-events.ts.
-- Times arrive as epoch ms and are stored with to_timestamp(ms / 1000.0), the same
-- conversion merge_video_events already uses for saved_at, so equal ms give equal times and
-- the order of times is kept.

-- ---------------------------------------------------------------------------------------
-- String length as JavaScript counts it (UTF-16 code units).
-- ---------------------------------------------------------------------------------------

-- char_length counts code points; JavaScript's String.length counts UTF-16 code units, so a
-- character above U+FFFF (most emoji) counts 2 there. This adds 1 per such character, so the
-- 1..64 bounds here match isValidChannelId and the zod max lengths exactly. (Postgres text
-- cannot hold lone surrogates or U+0000, so those JavaScript-only strings never reach here.)
create function public.utf16_length(p text)
returns integer
language sql
immutable
strict
parallel safe
set search_path = public
as $$
  select char_length(p) * 2 - char_length(regexp_replace(p, '[\U00010000-\U0010FFFF]', '', 'g'));
$$;

revoke execute on function public.utf16_length(text) from public, anon;
grant execute on function public.utf16_length(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- 1. Path open time (Req 3.10)
-- ---------------------------------------------------------------------------------------

-- Time the owner last opened the path. Covered by the existing paths_owner policy.
alter table public.paths add column last_opened_at timestamptz;

-- Records that the signed-in user opened one of their paths, at most once per hour so a
-- busy page does not write on every visit. Another user's path id updates no row.
create function public.touch_path_opened(p_path_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.paths
  set last_opened_at = now()
  where id = p_path_id
    and user_id = (select auth.uid())
    and (last_opened_at is null or last_opened_at < now() - interval '1 hour');
$$;

revoke execute on function public.touch_path_opened(uuid) from public, anon;
grant execute on function public.touch_path_opened(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------
-- 2. Channel_Mutes (Req 2)
-- ---------------------------------------------------------------------------------------

-- One record per user and channel id, updated in place (Req 2.3, decision D3).
create table public.channel_mutes (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  channel_id text not null check (public.utf16_length(channel_id) between 1 and 64),
  muted      boolean not null,
  changed_at timestamptz not null,
  primary key (user_id, channel_id)
);

alter table public.channel_mutes enable row level security;
grant select, insert, update, delete on public.channel_mutes to authenticated;

create policy channel_mutes_owner on public.channel_mutes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- p_rows: jsonb array of ChannelMute objects (serializeMute): channelId, muted, changedAt
-- (epoch ms). user_id is always auth.uid(); a user id in the payload is ignored.
-- Merge rule (mergeMute): the later changed_at wins; on equal changed_at muted is old OR new.
-- A row with an invalid channel id (not a string of 1 to 64 UTF-16 units) or a bad muted or
-- changedAt raises, which rolls back the whole call, so no mute of the batch is stored and
-- the existing mutes stay unchanged (Req 2.10).
create function public.merge_channel_mutes(p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r jsonb;
begin
  if v_uid is null then
    raise exception 'no_session' using errcode = '28000';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'bad_arguments' using errcode = '22023';
  end if;
  -- Row by row: two rows with the same channel id in one batch merge in order
  -- instead of failing a single INSERT ... ON CONFLICT.
  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) is distinct from 'object'
       or jsonb_typeof(r -> 'channelId') is distinct from 'string'
       or public.utf16_length(r ->> 'channelId') not between 1 and 64 then
      raise exception 'invalid_channel_id' using errcode = '22023';
    end if;
    if jsonb_typeof(r -> 'muted') is distinct from 'boolean'
       or jsonb_typeof(r -> 'changedAt') is distinct from 'number' then
      raise exception 'bad_arguments' using errcode = '22023';
    end if;
    insert into public.channel_mutes as m (user_id, channel_id, muted, changed_at)
    values (
      v_uid,
      r ->> 'channelId',
      (r ->> 'muted')::boolean,
      to_timestamp((r ->> 'changedAt')::double precision / 1000.0)
    )
    on conflict (user_id, channel_id) do update set
      muted      = case
        when excluded.changed_at > m.changed_at then excluded.muted
        when excluded.changed_at < m.changed_at then m.muted
        else m.muted or excluded.muted
      end,
      changed_at = greatest(m.changed_at, excluded.changed_at);
  end loop;
end;
$$;

revoke execute on function public.merge_channel_mutes(jsonb) from public, anon;
grant execute on function public.merge_channel_mutes(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------
-- 3. Save_Snapshots on video events (Req 17.4, 17.10)
-- ---------------------------------------------------------------------------------------

-- The Save_Snapshot (videoId, title, channel, channelId, thumbnailUrl, durationSeconds) and
-- the Saved_Time of the save that produced it. Covered by the existing video_events_owner
-- policy, so each user reads and writes only their own.
alter table public.video_events add column snapshot jsonb
  check (snapshot is null or (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 4096));
alter table public.video_events add column snapshot_at timestamptz;

-- The stored form of a payload snapshot, or null when it is missing or has a bad shape,
-- as parseEvent does (saveSnapshotSchema; lengths in UTF-16 units). Only the six fields
-- are kept, as copySnapshot does, and durationSeconds is stored with trailing zeros of the
-- scale trimmed, so 90.0 and 90 give the same number and the same canonical text.
-- A snapshot over the 4096 byte column check is also treated as missing, so one oversized
-- record cannot make every retry of its batch fail; the TypeScript merge has no size limit,
-- so the two merges differ only for such a snapshot.
create function public.video_snapshot_parse(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object'
     or jsonb_typeof(p -> 'videoId') is distinct from 'string'
     or public.utf16_length(p ->> 'videoId') not between 1 and 64
     or jsonb_typeof(p -> 'title') is distinct from 'string'
     or public.utf16_length(p ->> 'title') > 500
     or jsonb_typeof(p -> 'channel') is distinct from 'string'
     or public.utf16_length(p ->> 'channel') > 200
     or not (p ? 'channelId')
     or not (jsonb_typeof(p -> 'channelId') = 'null'
             or (jsonb_typeof(p -> 'channelId') = 'string'
                 and public.utf16_length(p ->> 'channelId') between 1 and 64))
     or jsonb_typeof(p -> 'thumbnailUrl') is distinct from 'string'
     or public.utf16_length(p ->> 'thumbnailUrl') > 2048
     or jsonb_typeof(p -> 'durationSeconds') is distinct from 'number'
     or (p ->> 'durationSeconds')::numeric < 0 then
    return null;
  end if;
  v := jsonb_build_object(
    'videoId', p -> 'videoId',
    'title', p -> 'title',
    'channel', p -> 'channel',
    'channelId', p -> 'channelId',
    'thumbnailUrl', p -> 'thumbnailUrl',
    'durationSeconds', trim_scale((p ->> 'durationSeconds')::numeric)
  );
  if pg_column_size(v) > 4096 then
    return null;
  end if;
  return v;
end;
$$;

revoke execute on function public.video_snapshot_parse(jsonb) from public, anon;
grant execute on function public.video_snapshot_parse(jsonb) to authenticated;

-- True when snapshot b (with its time b_at) is kept over snapshot a, by the rule of
-- pickSnapshot in shared/utils/video-events.ts:
--   1. a present snapshot beats a missing one (so a removal never clears it);
--   2. the later snapshot_at wins, a null time being earlier than every time;
--   3. on equal snapshot_at, the smaller canonical text wins, built like snapshotCanonical:
--      concat_ws(chr(31), videoId, title, channel, channelId or '', thumbnailUrl,
--      durationSeconds), compared with collate "C" (byte order of UTF-8, which is code point
--      order, as compareCodePoints);
--   4. when the canonical texts are equal (possible only when a field holds U+001F), the
--      fields are compared one by one in the same order with collate "C", then
--      durationSeconds as a number, as compareFields does. On full equality a is kept.
-- When both are missing it returns false; the caller then keeps the later snapshot_at, as
-- pickSnapshot does with latest().
-- The canonical text uses the jsonb text of durationSeconds, which equals JavaScript's
-- String(n) for every value that is not below 1e-6 or at least 1e21 (where JavaScript
-- switches to exponent notation); durations are whole seconds well inside that range.
create function public.video_snapshot_takes_new(
  a jsonb, a_at timestamptz, b jsonb, b_at timestamptz
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  ca text;
  cb text;
  fa text[];
  fb text[];
  i integer;
begin
  if a is null then
    return b is not null;
  end if;
  if b is null then
    return false;
  end if;
  if a_at is distinct from b_at then
    if a_at is null then return true; end if;
    if b_at is null then return false; end if;
    return b_at > a_at;
  end if;
  ca := concat_ws(chr(31), a ->> 'videoId', a ->> 'title', a ->> 'channel',
                  coalesce(a ->> 'channelId', ''), a ->> 'thumbnailUrl', a ->> 'durationSeconds');
  cb := concat_ws(chr(31), b ->> 'videoId', b ->> 'title', b ->> 'channel',
                  coalesce(b ->> 'channelId', ''), b ->> 'thumbnailUrl', b ->> 'durationSeconds');
  if ca collate "C" <> cb collate "C" then
    return cb collate "C" < ca collate "C";
  end if;
  fa := array[a ->> 'videoId', a ->> 'title', a ->> 'channel',
              coalesce(a ->> 'channelId', ''), a ->> 'thumbnailUrl'];
  fb := array[b ->> 'videoId', b ->> 'title', b ->> 'channel',
              coalesce(b ->> 'channelId', ''), b ->> 'thumbnailUrl'];
  for i in 1 .. 5 loop
    if fa[i] collate "C" <> fb[i] collate "C" then
      return fb[i] collate "C" < fa[i] collate "C";
    end if;
  end loop;
  return (b ->> 'durationSeconds')::numeric < (a ->> 'durationSeconds')::numeric;
end;
$$;

revoke execute on function public.video_snapshot_takes_new(jsonb, timestamptz, jsonb, timestamptz) from public, anon;
grant execute on function public.video_snapshot_takes_new(jsonb, timestamptz, jsonb, timestamptz) to authenticated;

-- merge_video_events, replaced. Same signature, owner, security and grants as in
-- 20261110000200_video_events.sql; every rule of before is unchanged.
-- p_rows: jsonb array of VideoEvent objects (serializeEvent: camelCase keys, times as epoch
-- ms or null): videoId, source, playedAt, watchedSeconds, finished, saved, savedAt,
-- skipped, snapshot, snapshotAt, updatedAt. Payloads without snapshot or snapshotAt (sent
-- before Fresh) read both as null. user_id is always auth.uid(); a user id in the payload
-- is ignored.
-- Merge rule per column:
--   played_at        earliest non-null
--   watched_seconds  greatest
--   finished         OR
--   saved_at         greatest (null is earlier than every time)
--   saved            value of the row with the later saved_at; old OR new when saved_at is equal
--   skipped          old OR new, kept only while no play exists
--   snapshot,        chosen together and apart from saved and saved_at, by
--   snapshot_at        video_snapshot_takes_new; when neither row has a snapshot,
--                      snapshot stays null and snapshot_at is the greatest
--   updated_at       greatest
-- The payload snapshot is read with video_snapshot_parse; snapshot_at is null when the
-- snapshot is null, as parseEvent does.
create or replace function public.merge_video_events(p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  r jsonb;
  v_played timestamptz;
  v_saved_at timestamptz;
  v_updated timestamptz;
  v_snapshot jsonb;
  v_snapshot_at timestamptz;
begin
  if v_uid is null then
    raise exception 'no_session' using errcode = '28000';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'bad_arguments' using errcode = '22023';
  end if;
  -- Row by row: two rows with the same key in one batch merge in order
  -- instead of failing a single INSERT ... ON CONFLICT.
  for r in select value from jsonb_array_elements(p_rows) loop
    v_played   := case when jsonb_typeof(r -> 'playedAt') = 'number'
                       then to_timestamp((r ->> 'playedAt')::double precision / 1000.0) end;
    v_saved_at := case when jsonb_typeof(r -> 'savedAt') = 'number'
                       then to_timestamp((r ->> 'savedAt')::double precision / 1000.0) end;
    v_updated  := coalesce(
                    case when jsonb_typeof(r -> 'updatedAt') = 'number'
                         then to_timestamp((r ->> 'updatedAt')::double precision / 1000.0) end,
                    now());
    v_snapshot := public.video_snapshot_parse(r -> 'snapshot');
    v_snapshot_at := case when v_snapshot is not null and jsonb_typeof(r -> 'snapshotAt') = 'number'
                          then to_timestamp((r ->> 'snapshotAt')::double precision / 1000.0) end;
    insert into public.video_events as e (
      user_id, video_id, source, played_at, watched_seconds, finished,
      saved, saved_at, skipped, snapshot, snapshot_at, updated_at
    ) values (
      v_uid,
      r ->> 'videoId',
      r ->> 'source',
      v_played,
      coalesce((r ->> 'watchedSeconds')::double precision, 0),
      coalesce((r ->> 'finished')::boolean, false),
      coalesce((r ->> 'saved')::boolean, false),
      v_saved_at,
      coalesce((r ->> 'skipped')::boolean, false) and v_played is null,
      v_snapshot,
      v_snapshot_at,
      v_updated
    )
    on conflict (user_id, video_id, source) do update set
      played_at       = least(e.played_at, excluded.played_at),
      watched_seconds = greatest(e.watched_seconds, excluded.watched_seconds),
      finished        = e.finished or excluded.finished,
      saved_at        = greatest(e.saved_at, excluded.saved_at),
      saved           = case
        when e.saved_at is not distinct from excluded.saved_at then e.saved or excluded.saved
        when excluded.saved_at is null then e.saved
        when e.saved_at is null then excluded.saved
        when excluded.saved_at > e.saved_at then excluded.saved
        else e.saved
      end,
      skipped         = (e.skipped or excluded.skipped)
                        and least(e.played_at, excluded.played_at) is null,
      snapshot        = case
        when public.video_snapshot_takes_new(e.snapshot, e.snapshot_at, excluded.snapshot, excluded.snapshot_at)
          then excluded.snapshot
        else e.snapshot
      end,
      snapshot_at     = case
        when e.snapshot is null and excluded.snapshot is null
          then greatest(e.snapshot_at, excluded.snapshot_at)
        when public.video_snapshot_takes_new(e.snapshot, e.snapshot_at, excluded.snapshot, excluded.snapshot_at)
          then excluded.snapshot_at
        else e.snapshot_at
      end,
      updated_at      = greatest(e.updated_at, excluded.updated_at);
  end loop;
end;
$$;

revoke execute on function public.merge_video_events(jsonb) from public, anon;
grant execute on function public.merge_video_events(jsonb) to authenticated;

-- Rollback (restores the merge_video_events of 20261110000200_video_events.sql first):
-- drop function public.video_snapshot_takes_new(jsonb, timestamptz, jsonb, timestamptz);
-- drop function public.video_snapshot_parse(jsonb);
-- alter table public.video_events drop column snapshot_at, drop column snapshot;
-- drop function public.merge_channel_mutes(jsonb);
-- drop table public.channel_mutes;
-- drop function public.touch_path_opened(uuid);
-- alter table public.paths drop column last_opened_at;
-- drop function public.utf16_length(text);
