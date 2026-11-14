# Supabase setup

Pursio keeps paths, progress and the profile in Supabase. This guide sets up a project from empty.

## 1. Apply the migrations

Apply the files in `supabase/migrations/` in file-name order:

1. `20261108000000_schema.sql`: tables, constraints, triggers and `save_generated_path`.
2. `20261108000100_rls.sql`: Row Level Security and its policies.
3. `20261108000200_quests.sql`: quest columns on `progress` (`quest_ticks`, `daily_pick`, `daily_bonus_count`) and `profiles` (`weekly_reward_week`, `weekly_reward_count`), with their check constraints.
4. `20261109000000_reset_progress.sql`: the functions `reset_progress` and `restore_progress` (security invoker, one transaction each), executable by signed-in users only.
5. `20261110000000_goal_language.sql`: `profiles.language`, `profiles.goal`, `paths.goal_class`, and a 7-argument `save_generated_path` (`p_goal_class` defaults to `'none'`) that replaces the 6-argument one.

6. `20261110000100_video_pipeline.sql`, `20261110000200_video_events.sql`: video pipeline tables and functions, and per-user video events.
7. `20261110000300_video_drain_cron.sql`: enables `pg_cron` and `pg_net` and schedules the `video-drain` job (every 20 seconds). See "Video drain job" below for the Vault secrets it needs.

Either run `supabase db push` with the Supabase CLI linked to the project, or paste each file into the dashboard SQL editor and run them in that order.

Rollout order: apply the quests migration before deploying the new client. The new client selects the new columns, so a database without them makes every load fail. An old client on the new database keeps working.

## 2. Dashboard settings

| Where | Setting | Value |
| --- | --- | --- |
| Authentication → Sign In / Providers | Allow anonymous sign-ins | On |
| Authentication → Sign In / Providers | Allow manual linking | On |
| Authentication → Sign In / Providers → Google | Enabled, with the client id and secret of your Google OAuth client | On |
| Authentication → Sign In / Providers → Email | Enabled, with "Confirm email" | On |
| Authentication → URL Configuration | Site URL | The production origin, e.g. `https://your-domain.example` |
| Authentication → URL Configuration | Redirect URLs | `http://localhost:3000/**` and `https://your-domain.example/**` |
| Authentication → Rate Limits | Anonymous sign-ins per hour per IP address | `30` to start with |

Notes:

- The anonymous sign-in limit is the only brake on scripts that create many anonymous users to use the default LLM key, because tree generation is limited per user. Lower it if you see abuse.
- In the Google Cloud console, add `https://<project-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI of the OAuth client.
- The built-in Supabase mailer sends **2 emails per hour**, and only to addresses of the project's team members. Email save and login will not work for other people until custom SMTP is set up under Authentication → Emails → SMTP Settings ([Supabase docs](https://supabase.com/docs/guides/auth/auth-smtp)). Google sign-in is not affected.

## 3. Environment keys

Set these three keys in your local environment file and in the hosting environment. Names only; never commit the values.

| Key | Used by |
| --- | --- |
| `NUXT_PUBLIC_SUPABASE_URL` | Browser and server |
| `NUXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server |
| `NUXT_SUPABASE_SERVICE_ROLE_KEY` | Server only, by `DELETE /api/account` |

### Video drain job

The `video-drain` cron job calls `POST <app URL>/api/videos/drain` every 20 seconds with the header `x-video-drain-secret`. It reads both values from Supabase Vault, so no value lives in a migration or in git. Until both secrets exist the job runs and sends nothing.

Create the secrets once per project in the SQL editor. Replace the placeholders:

```sql
select vault.create_secret('<app URL, e.g. https://your-domain.example>', 'video_drain_app_url');
select vault.create_secret('<same value as NUXT_VIDEO_DRAIN_SECRET on the host>', 'video_drain_secret');
```

- `video_drain_secret` must equal `NUXT_VIDEO_DRAIN_SECRET` on the host, or the route answers 401.
- To change a value, use `vault.update_secret(<id from vault.secrets>, '<new value>')`.
- Check runs with `select * from cron.job_run_details order by start_time desc limit 5;` and responses with `select * from net._http_response order by created desc limit 5;`.
- Roll back with `select cron.unschedule('video-drain');`.

## 4. Row Level Security checklist

Automated tests do not cover Row Level Security, so run this checklist by hand after applying the migrations and after any change to them.

Setup, in the dashboard:

- Create two users, A and B (Authentication → Users), and note their ids.
- As A, create one path and one progress row (use the app, or insert them from the SQL editor, which runs as `postgres` and skips RLS). A's profile row already exists through the trigger.

Run each step in the SQL editor inside a transaction that you roll back. To act as user B:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<B id>","role":"authenticated"}', true);
-- the step
rollback;
```

To act with no session:

```sql
begin;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
-- the step
rollback;
```

### `profiles`

| # | Step | Expected result |
| --- | --- | --- |
| 1 | As B: `select * from public.profiles where id = '<A id>';` | 0 rows |
| 2 | As B: `update public.profiles set display_name = 'x' where id = '<A id>';` | 0 rows affected |
| 3 | As B: `delete from public.profiles where id = '<A id>';` | 0 rows affected |
| 4 | As B: `insert into public.profiles (id) values ('<A id>');` | Row Level Security error |
| 5 | No session: `select * from public.profiles;` | 0 rows |
| 6 | No session: `insert into public.profiles (id) values ('<A id>');` | Row Level Security error |
| 7 | No session: `update public.profiles set display_name = 'x';` | 0 rows affected |
| 8 | No session: `delete from public.profiles;` | 0 rows affected |

### `paths`

| # | Step | Expected result |
| --- | --- | --- |
| 9 | As B: `select * from public.paths where user_id = '<A id>';` | 0 rows |
| 10 | As B: `update public.paths set archived = true where user_id = '<A id>';` | 0 rows affected |
| 11 | As B: `delete from public.paths where user_id = '<A id>';` | 0 rows affected |
| 12 | As B: `insert into public.paths (user_id, hobby, hobby_id, level, tree, mascot_set, model) values ('<A id>', 'Chess', 'chess', 'new', '{}', 'explorer', 'test');` | Row Level Security error |
| 13 | No session: `select * from public.paths;` | 0 rows |
| 14 | No session: `insert into public.paths (user_id, hobby, hobby_id, level, tree, mascot_set, model) values ('<A id>', 'Chess', 'chess', 'new', '{}', 'explorer', 'test');` | Row Level Security error |
| 15 | No session: `update public.paths set archived = true;` | 0 rows affected |
| 16 | No session: `delete from public.paths;` | 0 rows affected |

### `progress`

| # | Step | Expected result |
| --- | --- | --- |
| 17 | As B: `select * from public.progress where user_id = '<A id>';` | 0 rows |
| 18 | As B: `update public.progress set completed = '{}' where user_id = '<A id>';` | 0 rows affected |
| 19 | As B: `delete from public.progress where user_id = '<A id>';` | 0 rows affected |
| 20 | As B: `insert into public.progress (path_id, user_id) values ('<id of a path of A that has no progress row>', '<A id>');` | Row Level Security error |
| 21 | No session: `select * from public.progress;` | 0 rows |
| 22 | No session: `insert into public.progress (path_id, user_id) values ('<A path id>', '<A id>');` | Row Level Security error |
| 23 | No session: `update public.progress set completed = '{}';` | 0 rows affected |
| 24 | No session: `delete from public.progress;` | 0 rows affected |

### Progress belongs to the path's owner

| # | Step | Expected result |
| --- | --- | --- |
| 25 | As B: `insert into public.progress (path_id, user_id) values ('<id of a path of A that has no progress row>', '<B id>');` | Foreign key error |
| 26 | In the SQL editor without a role change: `update public.progress set user_id = '<B id>' where user_id = '<A id>';` then `rollback;` | Foreign key error |

### Quest columns

| # | Step | Expected result |
| --- | --- | --- |
| 27 | As B: `select quest_ticks from public.progress where user_id = '<A id>';` | 0 rows |
| 28 | As B: `update public.profiles set weekly_reward_count = 99 where id = '<A id>';` | 0 rows affected |
| 29 | As A (use A's id in the claims): `update public.profiles set weekly_reward_count = -1 where id = '<A id>';` | Check constraint error (`profiles_weekly_reward_count_nonneg`) |

### Reset progress

Setup: give A at least two paths, one of them archived, each with completed nodes, quest ticks, a daily pick and a bonus count, and set A's `weekly_reward_week` and `weekly_reward_count` to non-empty values. Note A's progress rows and profile reward before each step, and `rollback;` after each step (except R8, which runs R3 and the restore in one transaction).

| # | Step | Expected result |
| --- | --- | --- |
| R1 | As A: `select public.reset_progress('path', 'wipe', '<A path id>');` | Returns A's old row for that path. That row is empty (no `completed`, `quests`, `completed_at`, `quest_ticks`, `daily_pick`, bonus 0). A's other paths and the profile reward are unchanged |
| R2 | As A: `select public.reset_progress('all', 'keep_history');` | All of A's progress rows, archived paths included, have empty `completed` and `quests`, null `daily_pick` and bonus 0. `completed_at` and `quest_ticks` are unchanged. The profile reward is unchanged and the result's `reward` is null |
| R3 | As A: `select public.reset_progress('all', 'wipe');` | Same as R2, but `completed_at` and `quest_ticks` are empty too. The profile reward week is null and the count is 0. The result's `reward` holds the old values |
| R4 | As B: `select public.reset_progress('path', 'wipe', '<A path id>');` | Error `path_not_found`. A's rows and A's profile are unchanged |
| R5 | As B: `select public.reset_progress('all', 'wipe');` | Only B's rows change. A's rows and A's profile are unchanged |
| R6 | No session (`anon`): `select public.reset_progress('all', 'wipe');` | Permission denied. Nothing changed |
| R7 | As A: `select public.reset_progress('path', 'wipe');` (no path id), then with a bad scope, then with a bad mode | Error `path_not_found` for the first, `bad_arguments` for the others. Nothing changed, so a failed call leaves no half-reset state |
| R8 | As A: run R3 and keep its result, then in the same transaction `select public.restore_progress('<rows>'::jsonb, '<reward>'::jsonb);` with the returned `rows` and `reward` | A's rows and profile reward equal their values before R3 |
| R9 | As A: `select public.restore_progress('[{"path_id":"<B path id>","completed":[],"quests":{},"completed_at":{},"quest_ticks":{},"daily_pick":null,"daily_bonus_count":0}]'::jsonb);`. Also as no session | For A: B's rows and A's rows are unchanged. For no session: permission denied |
| R10 | As A: a path with no progress row, then R1 on it | An empty progress row exists afterwards |

### Afterwards

| # | Step | Expected result |
| --- | --- | --- |
| 30 | As A (use A's id in the claims): `select count(*) from public.paths;` | The number of A's paths, unchanged |
| 31 | Delete user B in Authentication → Users, then `select count(*) from public.profiles where id = '<B id>';` | 0 |
