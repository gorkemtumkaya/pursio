-- fresh: cron job that calls the Check_Route (Requirement 3.1, 3.2; design "fresh_check_cron").
-- Apply after 20261112000100_fresh_user.sql. Same setup as 20261110000300_video_drain_cron.sql.
--
-- Every 15 minutes (96 calls a day), pg_cron runs a statement that calls
--   POST <app URL>/api/fresh/check
-- through pg_net (net.http_post) with the header x-fresh-check-secret. The app URL is the
-- Vault secret video_drain_app_url (shared with the video drain job); the secret is the Vault
-- secret fresh_check_secret. Both are read at run time, never from this file. If either is
-- missing or empty, the statement selects no row and sends nothing, so no Check_Key's due
-- state changes.
--
-- The request timeout is 120000 ms, the Check_Route's function limit (maxDuration 120).
--
-- Vault setup (once per project, SQL editor; replace the placeholder, never commit real values):
--   -- video_drain_app_url already exists if the video drain job is set up; otherwise:
--   select vault.create_secret('<app URL, e.g. https://your-domain.example>', 'video_drain_app_url');
--   select vault.create_secret('<same value as NUXT_FRESH_CHECK_SECRET on the host>', 'fresh_check_secret');
-- To change a value later: select vault.update_secret(<id from vault.secrets>, '<new value>');
--
-- The job is idempotent: an existing job named 'fresh-check' is unscheduled before it is
-- scheduled again, so re-running this migration leaves exactly one job.
--
-- Rollback (run by hand):
--   select cron.unschedule('fresh-check');
--   -- optional: delete the Vault secret fresh_check_secret (vault.secrets). Keep
--   -- video_drain_app_url, the video drain job uses it.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Remove an existing job of the same name first.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'fresh-check') then
    perform cron.unschedule('fresh-check');
  end if;
end
$$;

select cron.schedule(
  'fresh-check',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := rtrim(c.app_url, '/') || '/api/fresh/check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-fresh-check-secret', c.check_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'video_drain_app_url' limit 1) as app_url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'fresh_check_secret' limit 1) as check_secret
  ) c
  where coalesce(trim(c.app_url), '') <> ''
    and coalesce(trim(c.check_secret), '') <> '';
  $job$
);
