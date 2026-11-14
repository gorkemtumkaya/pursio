# Implementation Plan: Skill Video Pipeline

## Overview

The plan builds the pipeline bottom-up. Early tasks settle the deploy preset, config keys and the API key transport. Shared types and pure utilities come next, then the migrations, the store interface with its in-memory and Postgres implementations, the provider, the fakes and the pipeline stages. After that come quota, lease and scheduler, ranking and fallback, the path generation extensions, the endpoints, settings, and the client (recorder and Watch UI). The last tasks run checkpoints, add the changelog entry and list the manual deployment steps.

Language: TypeScript (strict, no `any`), as in the design. Package manager: yarn. Test stack is the existing Vitest and fast-check; no new dependency is needed. If a task finds it needs a new dependency, it must stop and ask the user first and pin an exact version. New environment keys go in the example environment file with placeholder values only; real environment files are never read or edited.

## Tasks

- [x] 1. Preset, configuration and provider key verification
  - [x] 1.1 Confirm the Vercel deploy preset (decided by the user)
    - The host is Vercel; Supabase is only the database, Auth and pg_cron + pg_net. Check that `nuxt.config.ts` sets `nitro.preset = 'vercel'` and `maxDuration` 60 s, and restore them if missing
    - `background()` always returns `false` on Vercel, so every fill becomes a due `video_fills` row run by the cron drain. No `event.waitUntil`, no `@vercel/functions`, no reading of Vercel globals
    - _Requirements: 8.1, 8.2, 8.3, 9.18, 9.19_

  - [x] 1.2 Add runtime config keys and update the service-role-key comment
    - Add server-only `videoDailyQuota` and `videoDrainSecret` to `runtimeConfig` in `nuxt.config.ts`; keep `youtubeApiKey` out of `runtimeConfig.public`
    - Update the comment on `supabaseServiceRoleKey` so it names both readers, `account-runtime.ts` and `video/runtime.ts`
    - Add the new keys with placeholder values to the example environment file (never touch real environment files)
    - _Requirements: 2.4, 2.7, 2.8, 9.7, 9.20, 9.21_

  - [x] 1.3 Verify the `x-goog-api-key` header with one live YouTube call
    - Add a small script (for example `scripts/check-youtube-key.ts`) that reads the key from the process environment and calls `videos` with the header transport, printing only the HTTP status and never the key or URL
    - Ask the user to run it with their own key, because no secret may be read by the agent
    - If the header is rejected, switch the provider to the `key` query parameter with URL-free errors and note this in the task result
    - _Requirements: 2.4, 2.6, 2.7_

- [x] 2. Shared types and pure utilities
  - [x] 2.1 Create shared video types
    - Create `shared/types/video.ts` with `GoalClass`, `VideoStyle`, `VideoSource`, `PoolVideo`, `VideoPool`, `RankedVideo`, `VideosRequest`, `VideosResponse` and `VideoEvent`
    - _Requirements: 7.1, 10.1, 10.8, 10.18, 13.9, 13.15_

  - [x] 2.2 Implement normalization, Pool_Key and Pacific time helpers
    - Create `shared/utils/video-normalize.ts` with `normalizeText`, `languageCode` and `poolKey`
    - Create `shared/utils/pacific-time.ts` with `pacificDay` and `nextPacificMidnight` using `Intl.DateTimeFormat` (no new dependency)
    - _Requirements: 3.3, 3.4, 5.4, 7.11, 7.13, 9.2, 9.6_

  - [ ]* 2.3 Write property tests for normalization, language code and Pacific time
    - **Property 7: Normalization and Pool_Key**
    - **Property 8: Language code**
    - **Property 23: Pacific day boundaries**
    - **Validates: Requirements 7.11, 7.13, 3.3, 3.4, 5.4, 9.2, 9.6, 14.10, 14.30, 14.39**

  - [x] 2.4 Implement search query validation
    - Create `shared/utils/search-queries.ts` with `LEVEL_TERMS`, `QueryIssue` and `validateSearchQueries`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10_

  - [ ]* 2.5 Write property tests for query validation
    - **Property 1: Search query validation**
    - **Property 2: Level terms rule**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10**

  - [x] 2.6 Implement video event reducers and merge
    - Create `shared/utils/video-events.ts` with `applyPlay`, `applyProgress`, `applySave`, `applySkip`, `mergeEvents`, `combineSources`, `countFeedSkips`, `serializeEvent` and `parseEvent` (zod)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.13, 13.16, 13.17, 13.18, 13.19, 13.20_

  - [x] 2.7 Write property tests for event reducers, merge, combine and round trip
    - **Property 35: Event reducers**
    - **Property 36: Event merge**
    - **Property 37: Event combine across sources and skipped counting**
    - **Property 38: Event round trip**
    - **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.8, 13.10, 13.13, 13.16, 13.17, 13.18, 13.19, 13.20, 14.17, 14.36**

  - [x] 2.8 Implement Watch how matching and display helpers
    - Create `shared/utils/watch-how.ts` with `watchHowFor`, `formatDuration`, `topCards` and `showPoolLanguageLabel`
    - _Requirements: 12.1, 12.2, 12.11, 12.12, 12.18_

  - [ ]* 2.9 Write property tests for Watch how and display helpers
    - **Property 33: Watch how matching**
    - **Property 34: Watch section selection, duration format and language label**
    - **Validates: Requirements 12.1, 12.2, 12.11, 12.12, 12.18, 14.20, 14.21**

- [x] 3. Database migrations
  - [x] 3.1 Add the goal and language migration
    - Create `supabase/migrations/20261110000000_goal_language.sql`: `profiles.language`, `profiles.goal`, `paths.goal_class`, and the 7-argument `save_generated_path` with `p_goal_class` default `'none'` and the same grants as before
    - _Requirements: 1.11, 1.12, 1.20_

  - [x] 3.2 Add the pipeline tables and functions migration
    - Create `supabase/migrations/20261110000100_video_pipeline.sql`: `video_pools`, `video_leases`, `video_quota`, `video_fills`, the due index, and all SQL functions from the design (`video_quota_reserve`, `video_quota_saturate`, `video_lease_take`, `video_lease_release`, `video_pool_store`, `video_pools_read`, `video_fill_upsert`, `video_fills_due`, `video_fill_delete`)
    - Enable RLS with no policies, revoke all table access from `anon` and `authenticated`, and grant function execute to `service_role` only
    - _Requirements: 7.8, 7.9, 7.12, 7.14, 9.1, 9.5, 9.14, 9.15, 9.16, 9.17_

  - [x] 3.3 Add the video events migration
    - Create `supabase/migrations/20261110000200_video_events.sql`: `video_events` with owner RLS policy and `merge_video_events(p_rows jsonb)` implementing the same merge rule as `mergeEvents`
    - _Requirements: 13.9, 13.11, 13.13, 13.20_

  - [ ]* 3.4 Write the gated database test for role denial and RLS isolation
    - Create `tests/integration/video-db.test.ts`, skipped unless a local test database URL is provided
    - Check that client roles cannot read or write the pipeline tables and that `video_events` is isolated per user
    - _Requirements: 9.17, 13.11, 14.26, 14.31_

  - [x] 3.5 Add the video drain cron migration
    - Create `supabase/migrations/20261110000300_video_drain_cron.sql`: enable `pg_cron` and `pg_net`, and schedule a job every 20 seconds that calls `POST <app URL>/api/videos/drain` through `net.http_post` with the `x-video-drain-secret` header
    - Read the app URL and the secret from Supabase Vault (`vault.decrypted_secrets`, names `video_drain_app_url` and `video_drain_secret`), never from the file; the job does nothing if either secret is missing
    - Make the migration idempotent (unschedule an existing job of the same name first), add a rollback comment block, and put a short Vault setup note (no real values) in the migration header and in `supabase/README.md`
    - _Requirements: 9.18, 9.20, 9.21_
- [x] 4. Provider, pipeline store and fakes
  - [x] 4.1 Implement the provider interface and the YouTube provider
    - Create `server/utils/video/provider.ts` (`VideoProvider`, `ProviderError`, result types), `youtube-provider.ts` (`createYouTubeProvider({ apiKey, fetcher })`, key in the header, 10 s timeout, error mapping with kind only) and `select-provider.ts` as the only importer of `youtube-provider.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2, 4.3_

  - [ ]* 4.2 Write tests for the provider and the import boundary
    - **Property 9: Search request parameters**
    - **Property 25: Secrets never leak**
    - Add an import-boundary test (only `select-provider.ts` imports `youtube-provider.ts`) and a test for the not-configured case with zero fetch calls
    - **Validates: Requirements 2.3, 2.5, 2.6, 2.7, 3.2, 3.3, 3.4, 3.5, 3.6, 9.13, 14.27**

  - [x] 4.3 Define the pipeline store interface and the in-memory implementation
    - Create `server/utils/video/pipeline-store.ts` (`PipelineStore`: pools read and store, lease take and release, quota reserve and saturate, fills upsert, due and delete)
    - Create the in-memory implementation with an injected clock that mirrors the SQL functions, can be shared by several scheduler instances and has a `restart()` helper
    - _Requirements: 7.8, 7.9, 7.12, 7.14, 9.14, 9.15, 9.16_

  - [x] 4.4 Implement the Postgres pipeline store
    - Create `server/utils/video/pipeline-store-pg.ts` calling the SQL functions through the service-role client; staleness uses the database clock values returned by `video_pools_read`
    - _Requirements: 7.9, 7.14, 9.14, 9.16, 9.17_

  - [x] 4.5 Create the test fakes
    - Create `tests/support/video-fakes.ts` with `FakeVideoProvider` (scripted results and failures, records search requests), `FakeJudge` (a `ProviderAdapter` with scripted verdicts, bad output or errors, records the user text) and `FakeBackground` (collects promises, `kill()` mode, `unavailable` mode)
    - Set a sentinel API key in the test environment for the leak tests
    - _Requirements: 14.18, 14.31_

  - [ ]* 4.6 Write contract tests for the store implementations
    - Run one contract suite against the in-memory store (and against the Postgres store when the test database is available)
    - Cover atomic quota reserve, lease take at 299 s and 300 s, store requiring the lease run id, restart survival
    - _Requirements: 7.12, 9.14, 9.15, 9.16, 14.22, 14.24, 14.25_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Pipeline stages
  - [x] 6.1 Add `generateStructured` to the provider adapters
    - Extend `ProviderAdapter` in `server/utils/providers/types.ts` and implement the method in the Anthropic and OpenAI adapters, mapping failures to the existing `AdapterFailure` codes
    - _Requirements: 1.11, 1.18, 6.1, 6.7, 9.9_

  - [x] 6.2 Implement the search and details stages
    - Create `server/utils/video/search.ts` (parallel calls, quota reserve per call, `classifySearch`, merge and dedupe with first occurrence winning) and `details.ts` (batches of 50, unknown fields, dropped missing ids, skip on empty)
    - _Requirements: 3.1, 3.7, 3.8, 3.9, 3.10, 3.11, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.1_

  - [x] 6.3 Write property tests for search and details
    - **Property 10: Merge keeps each video once, first occurrence first**
    - **Property 11: Search outcome classification**
    - **Property 12: Details batching and unknown fields**
    - **Validates: Requirements 3.7, 3.8, 3.9, 3.10, 3.11, 4.1, 4.3, 4.4, 4.6, 7.2, 14.7, 14.35**

  - [x] 6.4 Implement the filter stage
    - Create `server/utils/video/filter.ts` with `filterCandidates` (duration, quick tip, language, embeddable)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 6.5 Write property tests for the filter
    - **Property 13: Filter keeps exactly the passing candidates**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 14.6, 14.29**

  - [x] 6.6 Implement the Judge stage
    - Create `server/utils/video/judge.ts` (`judgeOutputSchema`, `buildJudgeInput`, `applyVerdicts`) and `server/prompts/video-judge.md`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 7.3_

  - [ ]* 6.7 Write property tests for the Judge input and output handling
    - **Property 14: Judge input**
    - **Property 15: Judge output handling**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 7.3, 14.13, 14.19**

  - [x] 6.8 Implement pool building and staleness
    - Create `server/utils/video/pool.ts` with the pool builder (unique ids, only judged videos) and `isStale` at 604800 s
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 6.9 Write property tests for pool staleness
    - **Property 16: Staleness boundary**
    - **Validates: Requirements 7.4, 7.5, 7.7, 14.5**

  - [x] 6.10 Implement `runPipeline`
    - Create `server/utils/video/pipeline.ts` chaining Search, Details, Filter, Judge and Store, with the failure outcomes (provider failure, model failure, blocked by quota, empty pool) and lease release
    - _Requirements: 3.9, 3.10, 3.11, 4.5, 6.7, 7.1, 7.7, 7.10, 9.8, 9.9, 9.10, 9.11_

- [x] 7. Quota, lease and scheduler
  - [x] 7.1 Implement the quota policy
    - Create `server/utils/video/quota.ts` with `dailyQuota`, `quotaThreshold`, and the gate (`reserveSearch`, `reserveDetails`, `markExceeded`)
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.7, 9.16_

  - [x] 7.2 Write property tests for quota
    - **Property 21: Quota never exceeds the daily limit**
    - **Property 22: Daily quota configuration**
    - **Validates: Requirements 9.1, 9.3, 9.4, 9.5, 9.7, 9.16, 14.8, 14.9, 14.25**

  - [x] 7.3 Implement the scheduler
    - Create `server/utils/video/scheduler.ts` with `requestFill`, `runFill` (lease, `running` row due in 300 s), `fillWindow` (at most 2 passed to `background`, rest queued; all queued when it returns `false`), `drainDue`, `nextRetry`, and the `currentWindow` helper
    - Every background task goes through the injected `background` dependency; when it returns `false`, write a due row
    - _Requirements: 7.6, 7.7, 7.8, 7.10, 7.12, 8.1, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 9.6, 9.12, 9.13, 9.15, 9.18, 9.19_

  - [x] 7.4 Write property and scenario tests for the scheduler
    - **Property 17: Single run per Pool_Key**
    - **Property 18: Lease expiry and takeover**
    - **Property 19: Failed runs keep the existing pool**
    - **Property 20: Current window and inline fill bound**
    - **Property 24: Retry schedule**
    - Add scenario tests for the killed run, restart, and the `unavailable` background mode
    - **Validates: Requirements 7.6, 7.8, 7.10, 7.12, 7.14, 8.4, 8.5, 8.6, 8.7, 8.9, 9.6, 9.8, 9.9, 9.10, 9.11, 9.12, 9.15, 14.3, 14.4, 14.11, 14.12, 14.22, 14.23, 14.24**

- [x] 8. Ranking and language fallback
  - [x] 8.1 Implement ranking and composition
    - Create `server/utils/video/ranking.ts` (`baseScore`, `goalAdjustment`, `rankVideos`) and `compose.ts` (`fallbackApplies`, `composeVideos`: per-pool ranking, English fallback, dedupe before the limit, `poolLanguage`)
    - _Requirements: 10.1, 10.15, 10.16, 10.17, 10.18, 10.20, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12_

  - [ ]* 8.2 Write property tests for ranking and fallback
    - **Property 29: Ranking order**
    - **Property 30: Goal rerank bound**
    - **Property 31: Language fallback composition**
    - **Validates: Requirements 10.1, 10.15, 10.16, 10.17, 10.18, 10.20, 11.1, 11.2, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 14.14, 14.40, 14.41, 14.43**

- [x] 9. Path generation extensions
  - [x] 9.1 Add `searchQueries` and `quickTip` to the skill tree
    - Add the optional fields to `SkillNode` in `shared/types/skill-tree.ts` and to the zod schema in `shared/utils/skill-tree-schema.ts`
    - Add the generation-only `requireVideoFields` option in `skill-tree-load.ts` (error kind `video_fields`, using `validateSearchQueries`), and extend `server/prompts/skill-tree.md` with query and quick-tip instructions that contain no Goal text
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.9, 1.10, 1.13, 1.14, 1.15, 1.16, 1.17, 1.20_

  - [x] 9.2 Implement the goal classifier
    - Create `server/utils/goal-classifier.ts` with `coerceGoalClass` and `classifyGoal` (no model call for an empty goal, `none` on any failure, 10 s timeout) and `server/prompts/goal-class.md`
    - _Requirements: 1.11, 1.12_

  - [x] 9.3 Implement the query writer
    - Create `server/utils/video/query-writer.ts` and `server/prompts/search-queries.md`; the input type contains hobby, skill and level only, and a failure is not retried inside the run
    - _Requirements: 1.8, 1.9, 1.18, 1.19_

  - [ ]* 9.4 Write tests for generation extensions
    - **Property 3: Query prompt ignores the Goal**
    - **Property 4: Goal class coercion**
    - **Property 5: Skill tree round trip with video fields**
    - **Property 6: Generation requires the video fields**
    - Extend `tests/arbitraries.ts` with queries and flags
    - **Validates: Requirements 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 1.17, 1.20, 14.1, 14.2, 14.28**

  - [x] 9.5 Wire goal and goal class into tree generation and saving
    - In `handleTreeRequest` accept optional `goal` (max 200 characters), run `classifyGoal` after the tree exists, store the result in `PathSaveInput.goalClass`, and call `deps.afterSave` after a successful save without waiting for it
    - Update `buildSaveArgs` in `shared/utils/cloud-path.ts` for `p_goal_class`, and `buildTreeRequest` in `app/utils/tree-client.ts` to send `goal` only when non-empty
    - _Requirements: 1.8, 1.9, 1.11, 1.12, 8.1, 8.2, 9.11_

- [x] 10. Endpoints and runtime wiring
  - [x] 10.1 Implement the runtime wiring
    - Create `server/utils/video/runtime.ts` that builds the real deps: config, service-role client, Postgres store, provider, limiter instance (60 per minute), and a `background` that always returns `false` so every fill becomes a due row
    - _Requirements: 2.4, 7.14, 8.1, 9.7, 9.14, 9.17_

  - [x] 10.2 Implement the videos handler and route
    - Create `server/utils/video/handlers.ts` with `handleVideosRequest` (token check, validation, rate limit by user or IP, pool reads, goal class, `composeVideos`, signed-out read-only path, skill cross-check before any fill, English fallback fill, opportunistic drain of at most 2) and `server/api/videos.post.ts`
    - _Requirements: 8.8, 8.10, 9.18, 9.22, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 10.14, 10.15, 10.19, 10.20, 10.21, 11.6, 11.12_

  - [x] 10.3 Implement the fill and drain handlers and routes
    - Add `handleFillRequest` and `handleDrainRequest` to `handlers.ts`, plus `server/api/videos/fill.post.ts` (verified token required, 202 immediately) and `server/api/videos/drain.post.ts` (constant-time secret check, at most 5 fills, 404 when no secret is configured)
    - _Requirements: 8.3, 8.10, 9.18, 9.20, 9.21, 9.22_

  - [x] 10.4 Wire `afterSave` into the tree route
    - Connect the real `afterSave` from `runtime.ts` to the tree request route so path creation starts `fillWindow` in the background
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 9.11_

  - [ ]* 10.5 Write handler tests
    - **Property 25: Secrets never leak**
    - **Property 26: Invalid, unauthorized and over-limit requests have no side effects**
    - **Property 27: Signed-out requests read only**
    - **Property 28: Drain bounds and secret**
    - **Property 32: English fallback fill requests**
    - Add example tests for fill source (stored skill wins over body values), the sentinel key in responses, and no pipeline state in responses
    - **Validates: Requirements 2.7, 8.10, 9.18, 9.20, 9.21, 9.22, 10.3, 10.4, 10.5, 10.6, 10.9, 10.10, 10.11, 10.12, 10.14, 10.19, 10.20, 10.21, 11.12, 14.15, 14.18, 14.32, 14.33, 14.34, 14.37, 14.42**

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Settings additions (language and goal)
  - [x] 12.1 Add language and goal to the profile data
    - Add `language` and `goal` to `ProfileRow` and `ProfilePatch` in `shared/types/cloud.ts`, parse them in `cloud-rows.ts` and expose them in `useCloudStore` like `displayName`
    - _Requirements: 1.11, 10.1_

  - [x] 12.2 Add the browser settings store and the Settings page fields
    - Create `app/utils/user-settings.ts` (key `pursio-user-settings:v1`, default language `en`, no browser language detection)
    - Add a Language select and a Goal text field (max 200 characters, optional) to the Settings page using theme token utilities only
    - _Requirements: 1.11, 3.3, 10.1, 12.15_

- [x] 13. Client: Watch section and event recorder
  - [x] 13.1 Implement the videos client and composable
    - Create `app/utils/video-api.ts` (`fetchVideos`, `requestFill`) and `app/composables/useSkillVideos.ts` with states `hidden`, `finding`, `ready`, polling every 5 s up to 24 times (120 s) for signed-in users only
    - _Requirements: 8.3, 10.1, 10.3, 12.7, 12.8, 12.9, 12.10, 12.16, 12.17_

  - [x] 13.2 Implement the event store and recorder
    - Create `app/utils/video-events-store.ts` (localStorage key `pursio-video-events:v1`), add `mergeVideoEvents` to `CloudApi`, and create `app/composables/useVideoEvents.ts` reusing `createSaveQueue` with a 30 s retry and a retry at app start
    - Move local records to the cloud when the cloud store becomes ready
    - _Requirements: 13.1, 13.2, 13.9, 13.11, 13.12, 13.13, 13.14, 13.15_

  - [x] 13.3 Build the Watch components
    - Create `app/utils/youtube-iframe.ts` (loader and minimal types, no dependency), `WatchEmbedPlayer.vue`, `WatchVideoCard.vue` (language label, skip observer at 50 percent for 2 s) and `WatchSection.vue` under `app/components/watch/`
    - Use theme token utilities only, keyboard activation, accessible names with the video title, no autoplay before a user action
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.14, 12.15, 12.18, 13.2, 13.7_

  - [x] 13.4 Wire the Watch section into the path views
    - Add the `watchHow` prop and `watch` emit to `PathQuestItem.vue`, the videos state and `activeVideoId` to `PathNodeDetail.vue`, and the videos request and the debounced fill request on current-skill change to `PathView.vue`
    - Make sure a failed videos request leaves the quests usable and that playing a video does not touch XP, level or streak
    - _Requirements: 8.3, 8.10, 12.1, 12.6, 12.10, 12.11, 12.12, 12.13, 12.16, 12.17_

  - [ ]* 13.5 Write client-side tests
    - Test the Watch state logic at composable and helper level (3 cards from more than 3 videos, no play before an action, language label only on mismatch), a convention test for hardcoded colors in `app/components/watch/*`, and a test that the client requests no provider host except the embed, player script and thumbnail hosts
    - **Validates: Requirements 12.1, 12.5, 12.15, 12.18, 9.17, 2.9, 14.16, 14.38**

- [x] 14. Final checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`, and ensure everything passes, ask the user if questions arise.

- [x] 15. Changelog
  - [x] 15.1 Add the changelog entries under Unreleased
    - Add user-facing one-line entries under `## [Unreleased]` in `CHANGELOG.md` (Added: videos in the skill sheet, language and goal settings, "Watch how" links; Changed: new paths include video search data), each referencing `(spec: skill-video-pipeline)`, without rewriting existing entries
    - _Requirements: 12.1, 12.11, 10.15, 11.4_

- [x] 16. Deployment notes
  - [x] 16.1 Write the manual deployment steps in the task result
    - Documentation only: do not create or edit any file, and do not read or print any secret value; refer to keys by name only
    - List these manual steps for the user in the task result:
      - Push the four migrations (`20261110000000_goal_language.sql`, `20261110000100_video_pipeline.sql`, `20261110000200_video_events.sql`, `20261110000300_video_drain_cron.sql`) to the production Supabase project
      - Set `NUXT_YOUTUBE_API_KEY` and `NUXT_VIDEO_DRAIN_SECRET` on the host, and optionally `NUXT_VIDEO_DAILY_QUOTA`
      - Confirm `NUXT_SUPABASE_SERVICE_ROLE_KEY` is set on the host
      - Store `video_drain_app_url` and `video_drain_secret` in Supabase Vault (the secret must equal `NUXT_VIDEO_DRAIN_SECRET`), see `supabase/README.md`
      - Open the first skills of the demo hobbies while signed in, so their video pools are filled before the demo
    - _Requirements: 2.4, 2.7, 9.7, 9.17, 9.20, 9.21_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation.
- Property tests validate universal correctness properties; unit and scenario tests validate examples and edge cases.
- No new dependencies are planned. If one is needed (for example a DOM test library), stop and ask the user first.
- Task 1.3 needs the user (a live key run).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "3.2", "3.3", "3.5"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "2.6", "2.8", "3.4", "4.1", "6.1", "12.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "2.7", "2.9", "4.2", "4.3", "4.4", "6.4", "6.6", "6.8", "8.1", "9.2", "12.2", "13.1"] },
    { "id": 3, "tasks": ["2.5", "4.5", "6.5", "6.7", "6.9", "7.1", "8.2", "9.1", "9.3", "13.2", "13.3"] },
    { "id": 4, "tasks": ["4.6", "6.2", "7.2", "9.4", "13.4"] },
    { "id": 5, "tasks": ["6.3", "6.10", "13.5"] },
    { "id": 6, "tasks": ["7.3"] },
    { "id": 7, "tasks": ["7.4", "9.5", "10.1"] },
    { "id": 8, "tasks": ["10.2"] },
    { "id": 9, "tasks": ["10.3"] },
    { "id": 10, "tasks": ["10.4", "10.5"] },
    { "id": 11, "tasks": ["15.1"] },
    { "id": 12, "tasks": ["16.1"] }
  ]
}
```
