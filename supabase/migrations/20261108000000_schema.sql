-- accounts-cloud-save: tables, constraints, triggers and the save function.
-- Apply before 20261108000100_rls.sql.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 40),   -- null = no name
  theme text not null default 'boulder' check (theme in ('boulder', 'trail', 'halloween')),
  created_at timestamptz not null default now()
);

create table public.paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hobby text not null,
  hobby_id text not null,
  level text not null check (level in ('new', 'some', 'serious')),
  tree jsonb not null,
  mascot_set text not null,
  model text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, hobby_id),
  unique (id, user_id)                       -- target of the composite foreign key
);

create table public.progress (
  path_id uuid primary key,
  user_id uuid not null,
  completed text[] not null default '{}',
  quests jsonb not null default '{}',
  completed_at jsonb not null default '{}',  -- Node id -> epoch ms
  updated_at timestamptz not null default now(),
  -- The owner of a progress row is always the owner of its path.
  foreign key (path_id, user_id) references public.paths (id, user_id) on delete cascade
);

-- One Profile_Row per user, anonymous users included. There is no exception
-- block on purpose: an error here aborts the auth.users insert, so no user
-- exists without a profile.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at comes from the database clock, not the client.
create function public.touch_progress_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger progress_touch_updated_at
  before update on public.progress
  for each row execute function public.touch_progress_updated_at();

-- Saves a generated path for the calling user in one transaction: a path with
-- the same Hobby_Id keeps its id and created_at, gets the new content, is
-- restored if archived, and its progress is reset. Runs as the caller, so Row
-- Level Security applies. Without a session auth.uid() is null and the call fails.
create function public.save_generated_path(
  p_hobby text,
  p_hobby_id text,
  p_level text,
  p_tree jsonb,
  p_mascot_set text,
  p_model text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.paths (user_id, hobby, hobby_id, level, tree, mascot_set, model, archived)
  values ((select auth.uid()), p_hobby, p_hobby_id, p_level, p_tree, p_mascot_set, p_model, false)
  on conflict (user_id, hobby_id) do update
    set hobby = excluded.hobby,
        level = excluded.level,
        tree = excluded.tree,
        mascot_set = excluded.mascot_set,
        model = excluded.model,
        archived = false
  returning id into v_id;

  delete from public.progress where path_id = v_id;

  return v_id;
end;
$$;

revoke execute on function public.save_generated_path(text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.save_generated_path(text, text, text, jsonb, text, text) to authenticated;
