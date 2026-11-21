-- paddle-billing: a mirror of Paddle customers, subscriptions and completed
-- transactions, written only by the webhook handler (POST /api/paddle/webhook).
-- Apply after 20261118000000_waitlist.sql.
--
-- Only the server reads and writes here, with the service role key. Row Level
-- Security is on with no policy, so the anon and authenticated roles can
-- neither read nor write these tables or call the functions.
--
-- Webhooks arrive at least once and out of order. Every write is an upsert
-- keyed on the Paddle id, and a row only moves forward: an event whose entity
-- `updated_at` is older than the stored one is ignored.

create table public.customers (
  customer_id text primary key check (customer_id like 'ctm\_%'),
  -- Lowercased, so the email bridge to a Pursio account is one equality check.
  email text not null check (char_length(email) <= 320 and email = lower(email)),
  paddle_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_email_idx on public.customers (email);

create table public.subscriptions (
  subscription_id text primary key check (subscription_id like 'sub\_%'),
  customer_id text not null references public.customers (customer_id),
  -- From the checkout's custom data (pursioUserId). Not trusted for the portal,
  -- which matches the customer by verified email only.
  user_id uuid references auth.users (id) on delete set null,
  -- active, trialing, past_due, paused or canceled. No check, so a status Paddle
  -- adds later is stored instead of failing the delivery; unknown means no access.
  status text not null,
  price_id text not null,
  product_id text not null,
  scheduled_change_action text check (scheduled_change_action in ('cancel', 'pause', 'resume')),
  scheduled_change_at timestamptz,
  next_billed_at timestamptz,
  paddle_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_customer_id_idx on public.subscriptions (customer_id);
create index subscriptions_user_id_idx on public.subscriptions (user_id);

create table public.transactions (
  transaction_id text primary key check (transaction_id like 'txn\_%'),
  customer_id text references public.customers (customer_id),
  subscription_id text,
  user_id uuid references auth.users (id) on delete set null,
  status text not null,
  origin text not null,
  currency_code text not null,
  -- Lowest currency unit, as Paddle sends it (e.g. "499" is USD 4.99).
  grand_total text not null,
  billed_at timestamptz,
  paddle_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_customer_id_idx on public.transactions (customer_id);

alter table public.customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.transactions enable row level security;

revoke all on table public.customers, public.subscriptions, public.transactions from anon, authenticated;

-- Upserts that only move a row forward. Security definer (like handle_new_user)
-- so they can check auth.users: a user id from custom data that names no user
-- is stored as null instead of failing the delivery on the foreign key.
-- Only service_role may execute them. They return true when the row was
-- written and false when the stored row is newer (a stale, out-of-order event).

create function public.paddle_upsert_customer(
  p_customer_id text,
  p_email text,
  p_paddle_updated_at timestamptz
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with written as (
    insert into public.customers as c (customer_id, email, paddle_updated_at)
    values (p_customer_id, lower(p_email), p_paddle_updated_at)
    on conflict (customer_id) do update
      set email = excluded.email,
          paddle_updated_at = excluded.paddle_updated_at,
          updated_at = now()
      where c.paddle_updated_at <= excluded.paddle_updated_at
    returning 1
  )
  select exists (select 1 from written);
$$;

create function public.paddle_upsert_subscription(
  p_subscription_id text,
  p_customer_id text,
  p_user_id uuid,
  p_status text,
  p_price_id text,
  p_product_id text,
  p_scheduled_change_action text,
  p_scheduled_change_at timestamptz,
  p_next_billed_at timestamptz,
  p_paddle_updated_at timestamptz
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with written as (
    insert into public.subscriptions as s (
      subscription_id, customer_id, user_id, status, price_id, product_id,
      scheduled_change_action, scheduled_change_at, next_billed_at, paddle_updated_at
    )
    values (
      p_subscription_id, p_customer_id, (select u.id from auth.users u where u.id = p_user_id), p_status, p_price_id, p_product_id,
      p_scheduled_change_action, p_scheduled_change_at, p_next_billed_at, p_paddle_updated_at
    )
    on conflict (subscription_id) do update
      set customer_id = excluded.customer_id,
          -- A later event without custom data never unlinks the account.
          user_id = coalesce(excluded.user_id, s.user_id),
          status = excluded.status,
          price_id = excluded.price_id,
          product_id = excluded.product_id,
          scheduled_change_action = excluded.scheduled_change_action,
          scheduled_change_at = excluded.scheduled_change_at,
          next_billed_at = excluded.next_billed_at,
          paddle_updated_at = excluded.paddle_updated_at,
          updated_at = now()
      where s.paddle_updated_at <= excluded.paddle_updated_at
    returning 1
  )
  select exists (select 1 from written);
$$;

create function public.paddle_upsert_transaction(
  p_transaction_id text,
  p_customer_id text,
  p_subscription_id text,
  p_user_id uuid,
  p_status text,
  p_origin text,
  p_currency_code text,
  p_grand_total text,
  p_billed_at timestamptz,
  p_paddle_updated_at timestamptz
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with written as (
    insert into public.transactions as t (
      transaction_id, customer_id, subscription_id, user_id, status, origin,
      currency_code, grand_total, billed_at, paddle_updated_at
    )
    values (
      p_transaction_id, p_customer_id, p_subscription_id, (select u.id from auth.users u where u.id = p_user_id), p_status, p_origin,
      p_currency_code, p_grand_total, p_billed_at, p_paddle_updated_at
    )
    on conflict (transaction_id) do update
      set customer_id = excluded.customer_id,
          subscription_id = excluded.subscription_id,
          user_id = coalesce(excluded.user_id, t.user_id),
          status = excluded.status,
          origin = excluded.origin,
          currency_code = excluded.currency_code,
          grand_total = excluded.grand_total,
          billed_at = excluded.billed_at,
          paddle_updated_at = excluded.paddle_updated_at,
          updated_at = now()
      where t.paddle_updated_at <= excluded.paddle_updated_at
    returning 1
  )
  select exists (select 1 from written);
$$;

revoke execute on function public.paddle_upsert_customer(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.paddle_upsert_subscription(text, text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.paddle_upsert_transaction(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.paddle_upsert_customer(text, text, timestamptz) to service_role;
grant execute on function public.paddle_upsert_subscription(text, text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.paddle_upsert_transaction(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz) to service_role;

-- Rollback:
-- drop function public.paddle_upsert_transaction(text, text, text, uuid, text, text, text, text, timestamptz, timestamptz);
-- drop function public.paddle_upsert_subscription(text, text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz);
-- drop function public.paddle_upsert_customer(text, text, timestamptz);
-- drop table public.transactions;
-- drop table public.subscriptions;
-- drop table public.customers;
