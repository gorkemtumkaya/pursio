-- founding-members: who bought a founding membership (one-time Paddle purchase).
-- Apply after 20261121000100_paddle_billing.sql.
--
-- One row per completed founding transaction, written only by the webhook
-- handler (POST /api/paddle/webhook) with the service role key. A refund or a
-- chargeback sets `refunded_at`: the perks end and the spot is free again.
-- The first 50 limit counts rows with `refunded_at is null`.
--
-- Row Level Security is on with no policy, so the anon and authenticated roles
-- can neither read nor write the table or call the function.

create table public.founding_members (
  transaction_id text primary key check (transaction_id like 'txn\_%'),
  customer_id text not null references public.customers (customer_id),
  -- From the checkout's custom data (pursioUserId). The buyer signs in before
  -- checkout, so this is normally set; a purchase without it is matched by
  -- the customer's verified email instead.
  user_id uuid references auth.users (id) on delete set null,
  purchased_at timestamptz not null,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);

create index founding_members_user_id_idx on public.founding_members (user_id);
create index founding_members_customer_id_idx on public.founding_members (customer_id);

alter table public.founding_members enable row level security;

revoke all on table public.founding_members from anon, authenticated;

-- Idempotent: a redelivered transaction.completed changes nothing, and never
-- clears `refunded_at` or unlinks an account. Security definer so it can check
-- auth.users: a user id that names no user is stored as null.
create function public.paddle_record_founding_member(
  p_transaction_id text,
  p_customer_id text,
  p_user_id uuid,
  p_purchased_at timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.founding_members as f (transaction_id, customer_id, user_id, purchased_at)
  values (
    p_transaction_id, p_customer_id,
    (select u.id from auth.users u where u.id = p_user_id),
    p_purchased_at
  )
  on conflict (transaction_id) do update
    set user_id = coalesce(f.user_id, excluded.user_id);
$$;

revoke execute on function public.paddle_record_founding_member(text, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.paddle_record_founding_member(text, text, uuid, timestamptz) to service_role;

-- Rollback:
-- drop function public.paddle_record_founding_member(text, text, uuid, timestamptz);
-- drop table public.founding_members;
