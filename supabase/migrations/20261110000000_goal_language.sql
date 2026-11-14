-- skill-video-pipeline: language and goal on the profile, goal class on the path,
-- and a 7-argument save_generated_path that stores the goal class.
-- Apply after 20261109000000_reset_progress.sql.
--
-- profiles.language and profiles.goal are null until the user sets them on the
-- Settings page (null language is read as 'en'). Existing RLS policies on
-- profiles and paths cover the new columns.

alter table public.profiles add column language text check (char_length(language) between 2 and 35);
alter table public.profiles add column goal text check (char_length(goal) <= 200);

-- A path made before this feature has goal_class 'none'.
alter table public.paths add column goal_class text not null default 'none'
  check (goal_class in ('targeted', 'casual', 'none'));

-- Replace the 6-argument function. Dropping it removes the old signature and its
-- grants, so a call with six arguments cannot resolve to a stale version.
drop function public.save_generated_path(text, text, text, jsonb, text, text);

-- Same behavior as before, plus goal_class. Runs as the caller, so Row Level
-- Security applies. Without a session auth.uid() is null and the call fails.
create function public.save_generated_path(
  p_hobby text,
  p_hobby_id text,
  p_level text,
  p_tree jsonb,
  p_mascot_set text,
  p_model text,
  p_goal_class text default 'none'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.paths (user_id, hobby, hobby_id, level, tree, mascot_set, model, goal_class, archived)
  values ((select auth.uid()), p_hobby, p_hobby_id, p_level, p_tree, p_mascot_set, p_model, p_goal_class, false)
  on conflict (user_id, hobby_id) do update
    set hobby = excluded.hobby,
        level = excluded.level,
        tree = excluded.tree,
        mascot_set = excluded.mascot_set,
        model = excluded.model,
        goal_class = excluded.goal_class,
        archived = false
  returning id into v_id;

  delete from public.progress where path_id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.save_generated_path(text, text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.save_generated_path(text, text, text, jsonb, text, text, text) to authenticated;

-- Rollback:
-- drop function public.save_generated_path(text, text, text, jsonb, text, text, text);
-- create function public.save_generated_path(...6 arguments, as in 20261108000000_schema.sql...);
-- revoke execute on function public.save_generated_path(text, text, text, jsonb, text, text) from public, anon;
-- grant execute on function public.save_generated_path(text, text, text, jsonb, text, text) to authenticated;
-- alter table public.paths drop column goal_class;
-- alter table public.profiles drop column goal;
-- alter table public.profiles drop column language;
