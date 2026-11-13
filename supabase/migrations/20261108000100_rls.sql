-- accounts-cloud-save: Row Level Security. Apply after 20261108000000_schema.sql.
--
-- Signed-in users, anonymous users included, have the `authenticated` role and
-- reach only their own rows. A request with no session runs as `anon`, which
-- has no policy: selects return no rows, inserts fail, updates and deletes
-- touch no rows. Deletes cascading from auth.users run as the table owner and
-- are not blocked.

alter table public.profiles enable row level security;
alter table public.paths enable row level security;
alter table public.progress enable row level security;

-- Table privileges, stated here so the result does not depend on the project's
-- default grants. Row access is decided by the policies below.
grant select, insert, update, delete on public.profiles, public.paths, public.progress to anon, authenticated;

create policy profiles_owner on public.profiles
  for all to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy paths_owner on public.paths
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy progress_owner on public.progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
