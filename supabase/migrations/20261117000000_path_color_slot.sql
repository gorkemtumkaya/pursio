-- fresh-v2: a Color_Slot (1 to 5) on every path. It picks the hobby's colors on the
-- Fresh page and never changes once set (Requirements 9.5 to 9.7).
-- Apply after 20261112000200_fresh_check_cron.sql.
--
-- Existing RLS policies on paths cover the new column: the owner reads and writes it
-- like the other columns. The app never updates it.

-- 1. The column. Nullable for now, so existing rows can be backfilled.
alter table public.paths add column color_slot smallint check (color_slot between 1 and 5);

-- 2. Backfill per user in creation order, archived paths included: 1, 2, 3, 4, 5, 1, ...
with numbered as (
  select id, row_number() over (partition by user_id order by created_at, id) as n
  from public.paths
)
update public.paths p
set color_slot = ((numbered.n - 1) % 5) + 1
from numbered
where p.id = numbered.id;

-- 3. A new row without a slot gets the slot after the one of the user's latest-created
-- path (archived ones included), 5 going back to 1, or 1 when the user has no path.
-- Runs as the caller, so Row Level Security applies: a user reads only their own rows.
-- A row inserted with a slot (Undo of a delete, the legacy import) keeps it.
-- save_generated_path is unchanged: its insert gets the slot here, and its
-- "on conflict do update" branch does not list color_slot, so a re-generated path
-- keeps the slot it has.
create function public.assign_path_color_slot()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_prev smallint;
begin
  if new.color_slot is not null then
    return new;
  end if;

  select p.color_slot into v_prev
  from public.paths p
  where p.user_id = new.user_id
  order by p.created_at desc, p.id desc
  limit 1;

  new.color_slot := case when v_prev is null then 1 else (v_prev % 5) + 1 end;
  return new;
end;
$$;

create trigger paths_assign_color_slot
  before insert on public.paths
  for each row execute function public.assign_path_color_slot();

-- 4. Every row has a slot from here on.
alter table public.paths alter column color_slot set not null;

-- Rollback:
-- drop trigger paths_assign_color_slot on public.paths;
-- drop function public.assign_path_color_slot();
-- alter table public.paths drop column color_slot;
