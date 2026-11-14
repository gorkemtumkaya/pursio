-- reset-progress: reset and restore of progress rows in one transaction.
-- Apply after 20261108000200_quests.sql.
--
-- Both functions are security invoker, so Row Level Security applies and
-- auth.uid() is the learner. Without a session auth.uid() is null and the call fails.

create function public.reset_progress(
  p_scope text,                 -- 'path' | 'all'
  p_mode text,                  -- 'wipe' | 'keep_history'
  p_path_id uuid default null   -- required for 'path'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_rows jsonb;
  v_reward jsonb := null;
  v_week text;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'no_session' using errcode = '28000';
  end if;
  if p_scope not in ('path', 'all') or p_mode not in ('wipe', 'keep_history') then
    raise exception 'bad_arguments' using errcode = '22023';
  end if;
  -- A path that is not the caller's fails the whole call, nothing changes.
  if p_scope = 'path' and (
    p_path_id is null
    or not exists (select 1 from public.paths where id = p_path_id and user_id = v_uid)
  ) then
    raise exception 'path_not_found' using errcode = 'P0002';
  end if;

  -- The values about to be overwritten: the Undo snapshot.
  select coalesce(jsonb_agg(jsonb_build_object(
    'path_id', pr.path_id,
    'completed', to_jsonb(pr.completed),
    'quests', pr.quests,
    'completed_at', pr.completed_at,
    'quest_ticks', pr.quest_ticks,
    'daily_pick', pr.daily_pick,
    'daily_bonus_count', pr.daily_bonus_count
  )), '[]'::jsonb)
  into v_rows
  from public.progress pr
  where pr.user_id = v_uid and (p_scope = 'all' or pr.path_id = p_path_id);

  -- A path with no progress row gets an empty one, so "reset" always ends in the same state.
  insert into public.progress as pr (path_id, user_id)
  select p.id, p.user_id from public.paths p
  where p.user_id = v_uid and (p_scope = 'all' or p.id = p_path_id)
  on conflict (path_id) do update set
    completed = '{}',
    quests = '{}',
    daily_pick = null,
    daily_bonus_count = 0,
    completed_at = case when p_mode = 'wipe' then '{}'::jsonb else pr.completed_at end,
    quest_ticks  = case when p_mode = 'wipe' then '{}'::jsonb else pr.quest_ticks end;

  -- The weekly reward is account-wide: only "all" + "wipe" clears it.
  if p_scope = 'all' and p_mode = 'wipe' then
    select weekly_reward_week, weekly_reward_count into v_week, v_count
    from public.profiles where id = v_uid;
    if found then
      v_reward := jsonb_build_object('week', v_week, 'count', v_count);
      update public.profiles set weekly_reward_week = null, weekly_reward_count = 0 where id = v_uid;
    end if;
  end if;

  return jsonb_build_object('rows', v_rows, 'reward', v_reward);
end;
$$;

create function public.restore_progress(p_rows jsonb, p_reward jsonb default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'no_session' using errcode = '28000';
  end if;

  -- A row whose path is gone matches nothing and is skipped.
  update public.progress pr set
    completed = array(select jsonb_array_elements_text(r.value -> 'completed')),
    quests = r.value -> 'quests',
    completed_at = r.value -> 'completed_at',
    quest_ticks = r.value -> 'quest_ticks',
    daily_pick = nullif(r.value -> 'daily_pick', 'null'::jsonb),
    daily_bonus_count = (r.value ->> 'daily_bonus_count')::integer
  from jsonb_array_elements(p_rows) as r(value)
  where pr.user_id = v_uid and pr.path_id = (r.value ->> 'path_id')::uuid;

  if p_reward is not null then
    update public.profiles set
      weekly_reward_week = p_reward ->> 'week',
      weekly_reward_count = (p_reward ->> 'count')::integer
    where id = v_uid;
  end if;
end;
$$;

revoke execute on function public.reset_progress(text, text, uuid) from public, anon;
grant execute on function public.reset_progress(text, text, uuid) to authenticated;
revoke execute on function public.restore_progress(jsonb, jsonb) from public, anon;
grant execute on function public.restore_progress(jsonb, jsonb) to authenticated;

-- Rollback:
-- drop function public.reset_progress(text, text, uuid);
-- drop function public.restore_progress(jsonb, jsonb);
