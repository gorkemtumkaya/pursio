-- skill-video-pipeline: server-only pipeline state (shared pools, run leases, daily quota, queued fills).
-- Apply after 20261110000000_goal_language.sql.
--
-- Only the service role reaches these tables. RLS is on with no policies, and anon and
-- authenticated have no table privileges. Every function is security definer and executable
-- by service_role only. The pool holds no user id and no token.

create table public.video_pools (
  pool_key  text primary key,
  videos    jsonb not null,
  stored_at timestamptz not null default now(),
  run_id    uuid not null
);

create table public.video_leases (
  pool_key text primary key,
  run_id   uuid not null,
  taken_at timestamptz not null default now()
);

create table public.video_quota (
  day  date primary key,                       -- Pacific_Day
  used integer not null default 0 check (used >= 0)
);

create table public.video_fills (
  pool_key     text primary key,
  job          jsonb not null,                 -- FillJob without persist; holds no user id and no token
  reason       text not null check (reason in ('new', 'stale', 'quota', 'retry', 'running')),
  attempts     integer not null default 0,
  attempts_day date,                           -- Pacific_Day the attempts count belongs to
  next_run_at  timestamptz not null,
  created_at   timestamptz not null default now()
);

create index video_fills_due on public.video_fills (next_run_at);

-- Server-only access: RLS on, no policies, no Client role privileges.
alter table public.video_pools  enable row level security;
alter table public.video_leases enable row level security;
alter table public.video_quota  enable row level security;
alter table public.video_fills  enable row level security;

revoke all on public.video_pools, public.video_leases, public.video_quota, public.video_fills
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.video_pools, public.video_leases, public.video_quota, public.video_fills
  to service_role;

-- Reserve quota units before a provider call, as one atomic statement.
-- The row lock on today's Pacific_Day row serializes concurrent instances.
-- p_gate true: also requires used < p_threshold (searches). Returns whether units were reserved.
create function public.video_quota_reserve(p_units int, p_quota int, p_threshold int, p_gate boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (timezone('America/Los_Angeles', now()))::date;
  v_rows integer;
begin
  if p_units is null or p_units <= 0 then
    raise exception 'bad_arguments' using errcode = '22023';
  end if;
  insert into public.video_quota (day, used) values (v_day, 0) on conflict (day) do nothing;
  update public.video_quota
  set used = used + p_units
  where day = v_day
    and used + p_units <= p_quota
    and (not p_gate or used < p_threshold);
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- The provider said the quota is exhausted: count the whole day as used.
create function public.video_quota_saturate(p_quota int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (timezone('America/Los_Angeles', now()))::date;
begin
  insert into public.video_quota (day, used) values (v_day, greatest(p_quota, 0))
  on conflict (day) do update set used = greatest(public.video_quota.used, greatest(p_quota, 0));
end;
$$;

-- Take the run lease for a pool key. A lease older than p_timeout_s can be taken over.
-- Returns whether the caller now owns the lease.
create function public.video_lease_take(p_key text, p_run uuid, p_timeout_s int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.video_leases as l (pool_key, run_id, taken_at)
  values (p_key, p_run, now())
  on conflict (pool_key) do update
    set run_id = p_run, taken_at = now()
    where l.taken_at <= now() - make_interval(secs => p_timeout_s);
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create function public.video_lease_release(p_key text, p_run uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.video_leases where pool_key = p_key and run_id = p_run;
end;
$$;

-- Store a finished pool. Only the run that still owns the lease may store (a late run
-- that lost the lease gets false). On success the lease and any queued fill for the key
-- (including the running row) are deleted, in the same transaction.
create function public.video_pool_store(p_key text, p_run uuid, p_videos jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select run_id into v_owner from public.video_leases where pool_key = p_key for update;
  if v_owner is null or v_owner <> p_run then
    return false;
  end if;
  insert into public.video_pools (pool_key, videos, stored_at, run_id)
  values (p_key, p_videos, now(), p_run)
  on conflict (pool_key) do update
    set videos = excluded.videos, stored_at = excluded.stored_at, run_id = excluded.run_id;
  delete from public.video_leases where pool_key = p_key;
  delete from public.video_fills where pool_key = p_key;
  return true;
end;
$$;

-- One row per requested key (at most 2), whether or not a pool exists. All times are epoch
-- milliseconds from the database clock, so the app server clock never decides staleness.
-- lease_active: an unexpired lease (under 300 s) exists. fill_next_run_ms: next_run_at of a queued fill.
create function public.video_pools_read(p_keys text[])
returns table (
  pool_key text,
  videos jsonb,
  stored_at_ms bigint,
  now_ms bigint,
  lease_active boolean,
  fill_next_run_ms bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_keys is null or cardinality(p_keys) > 2 then
    raise exception 'bad_arguments' using errcode = '22023';
  end if;
  return query
  select
    k.key,
    p.videos,
    (extract(epoch from p.stored_at) * 1000)::bigint,
    (extract(epoch from now()) * 1000)::bigint,
    exists (
      select 1 from public.video_leases l
      where l.pool_key = k.key and l.taken_at > now() - make_interval(secs => 300)
    ),
    (select (extract(epoch from f.next_run_at) * 1000)::bigint
       from public.video_fills f where f.pool_key = k.key)
  from unnest(p_keys) as k(key)
  left join public.video_pools p on p.pool_key = k.key;
end;
$$;

create function public.video_fill_upsert(
  p_key text,
  p_job jsonb,
  p_reason text,
  p_attempts int,
  p_attempts_day date,
  p_next timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.video_fills as f (pool_key, job, reason, attempts, attempts_day, next_run_at)
  values (p_key, p_job, p_reason, p_attempts, p_attempts_day, p_next)
  on conflict (pool_key) do update set
    job = excluded.job,
    reason = excluded.reason,
    attempts = excluded.attempts,
    attempts_day = excluded.attempts_day,
    next_run_at = excluded.next_run_at;
end;
$$;

-- Due rows, oldest first. Rows already locked by another drain are skipped.
create function public.video_fills_due(p_max int)
returns setof public.video_fills
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select f.* from public.video_fills f
  where f.next_run_at <= now()
  order by f.next_run_at
  limit greatest(p_max, 0)
  for update skip locked;
end;
$$;

create function public.video_fill_delete(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.video_fills where pool_key = p_key;
end;
$$;

revoke execute on function public.video_quota_reserve(int, int, int, boolean) from public, anon, authenticated;
revoke execute on function public.video_quota_saturate(int) from public, anon, authenticated;
revoke execute on function public.video_lease_take(text, uuid, int) from public, anon, authenticated;
revoke execute on function public.video_lease_release(text, uuid) from public, anon, authenticated;
revoke execute on function public.video_pool_store(text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.video_pools_read(text[]) from public, anon, authenticated;
revoke execute on function public.video_fill_upsert(text, jsonb, text, int, date, timestamptz) from public, anon, authenticated;
revoke execute on function public.video_fills_due(int) from public, anon, authenticated;
revoke execute on function public.video_fill_delete(text) from public, anon, authenticated;

grant execute on function public.video_quota_reserve(int, int, int, boolean) to service_role;
grant execute on function public.video_quota_saturate(int) to service_role;
grant execute on function public.video_lease_take(text, uuid, int) to service_role;
grant execute on function public.video_lease_release(text, uuid) to service_role;
grant execute on function public.video_pool_store(text, uuid, jsonb) to service_role;
grant execute on function public.video_pools_read(text[]) to service_role;
grant execute on function public.video_fill_upsert(text, jsonb, text, int, date, timestamptz) to service_role;
grant execute on function public.video_fills_due(int) to service_role;
grant execute on function public.video_fill_delete(text) to service_role;

-- Rollback:
-- drop function public.video_fill_delete(text);
-- drop function public.video_fills_due(int);
-- drop function public.video_fill_upsert(text, jsonb, text, int, date, timestamptz);
-- drop function public.video_pools_read(text[]);
-- drop function public.video_pool_store(text, uuid, jsonb);
-- drop function public.video_lease_release(text, uuid);
-- drop function public.video_lease_take(text, uuid, int);
-- drop function public.video_quota_saturate(int);
-- drop function public.video_quota_reserve(int, int, int, boolean);
-- drop table public.video_fills;
-- drop table public.video_quota;
-- drop table public.video_leases;
-- drop table public.video_pools;
