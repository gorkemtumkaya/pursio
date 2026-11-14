-- skill-video-pipeline: per-user video events and the server-side merge.
-- Apply after 20261110000100_video_pipeline.sql.
--
-- One row per (user, video, source), updated in place (Req 13.9). Owner-only RLS
-- (Req 13.11). merge_video_events applies the same rule as mergeEvents in
-- shared/utils/video-events.ts, so the merge is commutative, associative and
-- idempotent and retries and the local-to-cloud move are safe (Req 13.13, 13.20).

create table public.video_events (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_id        text not null check (char_length(video_id) between 1 and 64),
  source          text not null check (source in ('skill_sheet', 'feed')),
  played_at       timestamptz,
  watched_seconds double precision not null default 0 check (watched_seconds >= 0),
  finished        boolean not null default false,
  saved           boolean not null default false,
  saved_at        timestamptz,
  skipped         boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (user_id, video_id, source)
);

alter table public.video_events enable row level security;

grant select, insert, update, delete on public.video_events to authenticated;

create policy video_events_owner on public.video_events
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- p_rows: jsonb array of VideoEvent objects (camelCase keys, times as epoch ms or null):
-- videoId, source, playedAt, watchedSeconds, finished, saved, savedAt, skipped, updatedAt.
-- user_id is always auth.uid(); a user id in the payload is ignored.
-- Merge rule per column:
--   played_at        earliest non-null
--   watched_seconds  greatest
--   finished         OR
--   saved_at         greatest (null is earlier than every time)
--   saved            value of the row with the later saved_at; old OR new when saved_at is equal
--   skipped          old OR new, kept only while no play exists
--   updated_at       greatest
create function public.merge_video_events(p_rows jsonb)
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

    insert into public.video_events as e (
      user_id, video_id, source, played_at, watched_seconds, finished,
      saved, saved_at, skipped, updated_at
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
      updated_at      = greatest(e.updated_at, excluded.updated_at);
  end loop;
end;
$$;

revoke execute on function public.merge_video_events(jsonb) from public, anon;
grant execute on function public.merge_video_events(jsonb) to authenticated;

-- Rollback:
-- drop function public.merge_video_events(jsonb);
-- drop table public.video_events;
