# Supabase setup

Pursio keeps paths, progress and the profile in Supabase. This guide sets up a project from empty.

## 1. Apply the migrations

Apply the files in `supabase/migrations/` in file-name order:

1. `20261108000000_schema.sql`: tables, constraints, triggers and `save_generated_path`.
2. `20261108000100_rls.sql`: Row Level Security and its policies.

Either run `supabase db push` with the Supabase CLI linked to the project, or paste each file into the dashboard SQL editor and run them in that order.

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

### Afterwards

| # | Step | Expected result |
| --- | --- | --- |
| 27 | As A (use A's id in the claims): `select count(*) from public.paths;` | The number of A's paths, unchanged |
| 28 | Delete user B in Authentication → Users, then `select count(*) from public.profiles where id = '<B id>';` | 0 |
