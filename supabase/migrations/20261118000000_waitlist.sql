-- landing-page: the waitlist behind the founding section of the landing page.
-- One row per email address. `kind` says which list the address joined:
-- 'founding' (the founding member waitlist) or 'updates' (product news).
-- Apply after 20261117000000_path_color_slot.sql.
--
-- Only the server writes here, with the service role key (POST /api/waitlist).
-- Row Level Security is on with no policy, so the anon and authenticated roles
-- can neither read nor write the table.

create table public.waitlist (
  email text primary key check (char_length(email) <= 254 and email = lower(email)),
  kind text not null check (kind in ('founding', 'updates')),
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

revoke all on table public.waitlist from anon, authenticated;

-- Rollback:
-- drop table public.waitlist;
