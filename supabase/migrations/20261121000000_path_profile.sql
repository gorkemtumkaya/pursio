-- path-intake: the Learner_Profile stored with each path, and an 8-argument
-- save_generated_path that writes it (Requirements 11.1, 11.2, 11.7).
-- Apply after 20261118000000_waitlist.sql.
--
-- paths.profile is null for every path made before this feature and for a path built
-- without intake. Existing RLS policies on paths cover the new column: the owner reads
-- and writes it like the other columns.
--
-- Safe to apply before the deploy: the new function's last argument has a default, so
-- the current server's 7-argument call still resolves to it.

-- 1. The column. The size limit is a guard against junk, about 4 times the largest valid
-- profile in 4-byte characters; the shape is checked by the app.
alter table public.paths add column profile jsonb
  check (profile is null or (jsonb_typeof(profile) = 'object' and octet_length(profile::text) <= 16384));

-- 2. Replace the 7-argument function. Dropping it removes the old signature and its grants.
drop function public.save_generated_path(text, text, text, jsonb, text, text, text);

-- Same behavior as before, plus profile: a path with the same Hobby_Id keeps its id,
-- created_at and color_slot, gets the new content and the new profile (or null), is
-- restored if archived, and its progress is reset. Runs as the caller, so Row Level
-- Security applies. Without a session auth.uid() is null and the call fails.
create function public.save_generated_path(
  p_hobby text,
  p_hobby_id text,
  p_level text,
  p_tree jsonb,
  p_mascot_set text,
  p_model text,
  p_goal_class text default 'none',
  p_profile jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.paths (user_id, hobby, hobby_id, level, tree, mascot_set, model, goal_class, profile, archived)
  values ((select auth.uid()), p_hobby, p_hobby_id, p_level, p_tree, p_mascot_set, p_model, p_goal_class, p_profile, false)
  on conflict (user_id, hobby_id) do update
    set hobby = excluded.hobby,
        level = excluded.level,
        tree = excluded.tree,
        mascot_set = excluded.mascot_set,
        model = excluded.model,
        goal_class = excluded.goal_class,
        profile = excluded.profile,
        archived = false
  returning id into v_id;

  delete from public.progress where path_id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.save_generated_path(text, text, text, jsonb, text, text, text, jsonb) from public, anon;
grant execute on function public.save_generated_path(text, text, text, jsonb, text, text, text, jsonb) to authenticated;

-- Rollback:
-- drop function public.save_generated_path(text, text, text, jsonb, text, text, text, jsonb);
-- create function public.save_generated_path(...7 arguments, as in 20261110000000_goal_language.sql...);
-- revoke execute on function public.save_generated_path(text, text, text, jsonb, text, text, text) from public, anon;
-- grant execute on function public.save_generated_path(text, text, text, jsonb, text, text, text) to authenticated;
-- alter table public.paths drop column profile;
