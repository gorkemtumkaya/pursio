-- quests-page: quest tick times, the daily pick, the bonus count and the weekly reward.
-- Apply after 20261108000100_rls.sql.

alter table public.progress
  add column quest_ticks jsonb not null default '{}',          -- Node id -> [ms|null, ms|null, ms|null]
  add column daily_pick jsonb,                                  -- null = no pick yet
  add column daily_bonus_count integer not null default 0
    constraint progress_daily_bonus_count_nonneg check (daily_bonus_count >= 0);

alter table public.profiles
  add column weekly_reward_week text                            -- Week_Key (Monday, YYYY-MM-DD), null = never
    constraint profiles_weekly_reward_week_format check (weekly_reward_week ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  add column weekly_reward_count integer not null default 0
    constraint profiles_weekly_reward_count_nonneg check (weekly_reward_count >= 0);

-- Rollback:
-- alter table public.progress
--   drop column quest_ticks,
--   drop column daily_pick,
--   drop column daily_bonus_count;
-- alter table public.profiles
--   drop column weekly_reward_week,
--   drop column weekly_reward_count;
