-- skill-video-pipeline: cron job that drains queued video fills (design Decisions 7 and 9).
-- Apply after 20261110000200_video_events.sql.
--
-- Every 20 seconds, pg_cron runs a statement that calls
--   POST <app URL>/api/videos/drain
-- through pg_net (net.http_post) with the header x-video-drain-secret. The app URL and the
-- secret are read from Supabase Vault at run time, never from this file. If either is
-- missing or empty, the statement selects no row and sends nothing.
--
-- Vault setup (once per project, SQL editor; replace the placeholders, never commit real values):
--   select vault.create_secret('<app URL, e.g. https://your-domain.example>', 'video_drain_app_url');
--   select vault.create_secret('<same value as NUXT_VIDEO_DRAIN_SECRET on the host>', 'video_drain_secret');
-- To change a value later: select vault.update_secret(<id from vault.secrets>, '<new value>');
--
-- The job is idempotent: an existing job named 'video-drain' is unscheduled before it is
-- scheduled again, so re-running this migration leaves exactly one job.
--
-- Rollback (run by hand):
--   select cron.unschedule('video-drain');
--   -- optional, only if nothing else in the project uses them:
--   -- drop extension pg_net;
--   -- drop extension pg_cron;
--   -- optional: delete the two Vault secrets (vault.secrets, names video_drain_app_url and video_drain_secret)

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Remove an existing job of the same name first.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'video-drain') then
    perform cron.unschedule('video-drain');
  end if;
end
$$;

-- Seconds-level schedules need pg_cron 1.5 or later (available on current Supabase projects).
select cron.schedule(
  'video-drain',
  '20 seconds',
  $job$
  select net.http_post(
    url := rtrim(c.app_url, '/') || '/api/videos/drain',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-video-drain-secret', c.drain_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  from (
    select
      (select decrypted_secret from vault.decrypted_secrets where name = 'video_drain_app_url' limit 1) as app_url,
      (select decrypted_secret from vault.decrypted_secrets where name = 'video_drain_secret' limit 1) as drain_secret
  ) c
  where coalesce(trim(c.app_url), '') <> ''
    and coalesce(trim(c.drain_secret), '') <> '';
  $job$
);
