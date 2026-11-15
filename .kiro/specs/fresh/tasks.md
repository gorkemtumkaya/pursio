# Implementation Plan: Fresh

## Overview

The plan follows the module layout of `design.md`. Shared types and pure helpers come first (keys, mutes, Save_Snapshot, ranking, view), then the feed, Judge, Channel_Source and schedule logic, then the database migrations and the server pipeline (check store, `runFreshCheck`, Check_Route), then the Fresh_Endpoint, then the Client data layer, navigation and the Fresh_Page UI. Each step is wired into the previous ones, so no module is left unused.

Code is TypeScript (strict, no `any`) with `<script setup lang="ts">` for Vue files. Styling uses theme token utilities only. No new dependency is added: tests use the existing Vitest and fast-check. New environment keys go into the env example file with placeholder values; real env files are never read. Commands: `yarn typecheck` and `yarn test` (`vitest run`).

Test file conventions: unit tests in `tests/unit/fresh-*.test.ts` (do not touch the existing `tests/unit/fresh-samples.test.ts`), property tests in `tests/property/fresh-*.property.test.ts` with at least 100 runs each and the tag comment `// Feature: fresh, Property N: <title>`, fakes in `tests/support/fresh-fakes.ts`, the Feed_Printer in `tests/support/feed-printer.ts`.

## Tasks

- [x] 1. Shared types, channel ids and key helpers
  - [x] 1.1 Add the Fresh types and channel id fields
    - Create `shared/types/fresh.ts` with `CheckKey`, `FeedEntry`, `SaveSnapshot`, `ChannelMute`, `FreshPathSkill`, `FreshPath`, `SkillMatch`, `FreshItemCard`, `PoolCard`, `FreshSkillPool`, `FreshSource`, `FreshCheckTime`, `FreshResponseOk`, `FreshResponse`, `FreshRequestPath`, `FreshRequest` as in design Data Models
    - In `shared/types/video.ts` add `channelId: string | null` to `PoolVideo` and `RankedVideo`, and `snapshot: SaveSnapshot | null` to `VideoEvent`
    - In `server/utils/video/provider.ts` add `channelId: string | null` to `SearchHit` and `VideoDetails`
    - _Requirements: 1.7, 5.7, 8.12, 17.4_
  - [x] 1.2 Carry the channel id through the skill pipeline
    - `server/utils/video/youtube-provider.ts`: read `snippet.channelId` into `SearchHit` and `VideoDetails` (null when missing)
    - `server/utils/video/judge.ts`: copy `channelId` into `PoolVideo`; export `truncateDescription`
    - `server/utils/video/compose.ts`: copy `channelId` into `RankedVideo`; read a missing `channelId` of old pools as `null`
    - Update `tests/support/video-fakes.ts` so fakes produce `channelId`
    - _Requirements: 1.1, 1.7, 5.7, 6.2_
  - [x] 1.3 Implement `shared/utils/fresh-keys.ts`
    - `checkKey`, `checkKeyId`, `freshLeaseKey`, `checkKeysForPath`, `compareCodePoints`
    - Reduce every language with the existing `languageCode`, so a missing, empty or whitespace-only language gives `en`
    - _Requirements: 3.16, 8.11, 8.16_
  - [x] 1.4 Move the pool ranking scores to a Client-safe module
    - Create `shared/utils/video-ranking.ts` with `baseScore`, `goalAdjustment`, `GOAL_BONUS` moved from `server/utils/video/ranking.ts`
    - `server/utils/video/ranking.ts` re-exports them and keeps `rankVideos`; behavior unchanged
    - _Requirements: 9.1, 9.11_

- [x] 2. Channel_Mutes and Save_Snapshot logic
  - [x] 2.1 Implement `shared/utils/channel-mutes.ts`
    - `isValidChannelId` (1 to 64 characters), `mergeMute` (later `changedAt` wins, equal times keep muted true), `mergeMuteLists`, `parseMute`, `serializeMute`
    - _Requirements: 2.3, 2.6, 2.8, 2.10_
  - [x] 2.2 Write property test for Channel_Mute merge
    - **Property 3: Channel_Mute merge**
    - **Validates: Requirements 2.3, 2.6, 2.8**
  - [x] 2.3 Add the Save_Snapshot to Video_Events in `shared/utils/video-events.ts`
    - In `shared/types/video.ts` add `snapshotAt: number | null` (epoch ms, the Saved_Time of the save that produced the snapshot; null when there is no snapshot) next to `snapshot` on `VideoEvent`
    - `newEvent` sets `snapshot: null` and `snapshotAt: null`; `applySave(rec, saved, now, snapshot?)` on a save with a snapshot sets `snapshot` and `snapshotAt = now`; on removal (and on a save without a snapshot) keeps both unchanged
    - `mergeEvents`: `saved` and `savedAt` keep their current rule unchanged; the snapshot and its `snapshotAt` are chosen independently: a present snapshot beats a missing one, else the later `snapshotAt` wins, else on equal `snapshotAt` the smaller `snapshotCanonical` text by `compareCodePoints`; a removal never clears the snapshot (replaces the old "kept saved side" rule)
    - `snapshotCanonical` joins fields with U+001F; `serializeEvent` and `parseEvent` carry `snapshot` and `snapshotAt` and read a missing field as `null`
    - Keep `skill-video-pipeline` Property 36 (Event merge) and Property 38 (Event round trip) in `tests/property/video-events.property.test.ts` as full checks on the whole record: add `snapshot` and `snapshotAt` to their record generator
    - _Requirements: 17.4, 17.10_
  - [x] 2.4 Write property test for the save reducer with snapshot
    - **Property 37: Save reducer with snapshot**
    - **Validates: Requirements 12.6, 17.4**
  - [x] 2.5 Write property test for event merge with snapshot
    - **Property 38: Event merge with snapshot**
    - Commutative, associative and idempotent on the whole record, `snapshot` and `snapshotAt` included; later `snapshotAt` wins, canonical text breaks ties, present beats missing, a removal never clears the snapshot
    - **Validates: Requirements 17.10, 19.21**
  - [x] 2.6 Write property test for event round trip with snapshot
    - **Property 39: Event round trip with snapshot**
    - Whole-record round trip including `snapshot` and `snapshotAt`; a missing `snapshot` or `snapshotAt` field parses as null
    - **Validates: Requirements 17.10**

- [x] 3. Ranking and view building (pure, shared)
  - [x] 3.1 Implement scoring in `shared/utils/fresh-rank.ts`
    - Constants `FRESH_WINDOW_S`, `NEW_BADGE_S`, `NEW_MAX`, `BEST_MAX`, `TASTE_*`, `CLOSENESS`
    - `recencyFactor` (future time counts as age 0), `closenessFactor` against the match's own path (1.0, 0.8, 0.6; always 0.6 on a path with no Current_Skill), `bestMatch` with the tie-break of design
    - `tasteAdjustments` (0 under 10 records, +0.1 Finished, −0.1 for 3+ `feed` skips, clamp ±0.2, channel from cards else Save_Snapshot), `freshScore` using `goalAdjustment` from `shared/utils/video-ranking.ts`, `rankFreshItems` (score desc, published desc, id asc)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 9.9, 9.10_
  - [x] 3.2 Write property test for Fresh_Score parts
    - **Property 24: Fresh_Score parts**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
  - [x] 3.3 Write property test for Fresh_Item ranking order
    - **Property 25: Fresh_Item ranking order**
    - **Validates: Requirements 9.5, 19.8**
  - [x] 3.4 Write property test for the taste adjustment
    - **Property 26: Taste adjustment**
    - **Validates: Requirements 9.7, 9.8, 9.9, 9.10**
  - [x] 3.5 Implement `arrangeVariety` in `shared/utils/fresh-rank.ts`
    - Left-to-right placement with a waiting list, window 6, at most 2 per channel, null channel never conflicts, `tailStart` for cards placed at the end
    - _Requirements: 9.13, 9.14_
  - [x] 3.6 Write property test for variety rearrangement
    - **Property 27: Variety rearrangement**
    - **Validates: Requirements 9.13, 9.14, 19.10**
  - [x] 3.7 Implement `shared/utils/fresh-view.ts`
    - `FilterChip`, `FreshViewInput`, `FreshView` types; `buildFreshView` in the 8 steps of design (Selected_Path and Hero_Path resolution, chip scope, mute exclusion, 7-day filter, hero choice, New_Section cap 24, Best_Section order and cap 12 with dedupe, saved list, states)
    - `chooseHero`, `headerLabel`, `relativeTime`, `savedCards`, source groups (hobby order, name case-insensitive then id), chip list with visibility rules (hide "For <current skill>" without Current_Skill; hide "Saved" in Demo_Mode)
    - `isAllowedThumbnail(url)`: true only for `https:` URLs on host `i.ytimg.com`
    - Demo_Mode sets every taste value to 0
    - _Requirements: 9.6, 9.11, 9.12, 9.15, 11.4, 11.5, 11.6, 11.10, 12.1, 12.2, 12.3, 12.4, 12.7, 12.8, 12.9, 13.1, 13.5, 13.12, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.9, 14.10, 15.1, 15.2, 15.7, 15.8, 15.9, 16.2, 16.3, 18.3_
  - [x] 3.8 Write property test for Hero, New and Best dedupe and caps
    - **Property 28: Hero, New and Best dedupe and caps**
    - **Validates: Requirements 9.11, 9.12, 12.9, 13.1, 13.5**
  - [x] 3.9 Write property test for mute exclusion and re-application
    - **Property 29: Mute exclusion and re-application**
    - **Validates: Requirements 9.6, 12.8, 15.6**
  - [x] 3.10 Write property test for the hero choice
    - **Property 30: Hero choice**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.7**
  - [x] 3.11 Write property test for chip scope
    - **Property 31: Chip scope**
    - **Validates: Requirements 8.10, 14.3, 14.4, 14.5, 14.11**
  - [x] 3.12 Write property test for the saved list
    - **Property 32: Saved list**
    - **Validates: Requirements 14.6**
  - [x] 3.13 Write property test for header text and time labels
    - **Property 33: Header text and time labels**
    - **Validates: Requirements 11.4, 11.5, 11.6, 13.12**
  - [x] 3.14 Write property test for the Sources_Panel groups
    - **Property 34: Sources panel**
    - **Validates: Requirements 2.9, 15.1, 15.2, 15.7, 15.8**
  - [x] 3.15 Write property test for page state
    - **Property 35: Page state**
    - **Validates: Requirements 14.7, 16.2, 16.3**
  - [x] 3.16 Write property test for the snapshot thumbnail host
    - **Property 36: Snapshot thumbnail host**
    - **Validates: Requirements 18.3**
  - [x] 3.17 Write unit tests for taste and hero examples
    - 9 records give 0; Finished channel positive; 3 feed skips negative; `skill_sheet` skips change nothing; snapshot gives the channel
    - Hero labels, fallback, hidden with "Saved"; muting walks to the next item, then fallback, then hidden; Best excludes hero and new ids; "All skills" is the default chip
    - _Requirements: 19.9, 19.11, 19.19_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`. Ensure all tests pass, ask the user if questions arise.

- [x] 5. Channel_Feed reading
  - [x] 5.1 Implement the Feed_Parser and the Feed_Printer
    - `server/utils/fresh/feed-parser.ts`: single-pass scanner per design (declaration, comments, PIs, CDATA, tags, entities); `not_xml` for `<!DOCTYPE`, unknown entities, bad references, mismatched tags, content outside the root; `not_atom` for a wrong root or namespace; reads `yt:videoId`, `yt:channelId`, `title`, `published` per direct `entry`; skips invalid entries; keeps title whitespace
    - `tests/support/feed-printer.ts`: writes an Atom feed with escaped titles and UTC whole-second times
    - _Requirements: 4.8, 4.9, 4.10, 4.11, 18.4_
  - [x] 5.2 Write property test for print and parse round trip
    - **Property 14: Feed print and parse round trip**
    - **Validates: Requirements 4.8, 4.11, 4.12**
  - [x] 5.3 Write property test for parser robustness
    - **Property 15: Parser robustness**
    - **Validates: Requirements 4.9, 4.10**
  - [x] 5.4 Write unit tests for the parser
    - Unparseable document gives an error; entries with no video id or no valid published time are skipped while others are kept
    - _Requirements: 19.2_
  - [x] 5.5 Implement `server/utils/fresh/feed-fetch.ts` and the test fakes
    - `fetchChannelFeed`: fixed host and path, channel id checked and URL-encoded, no key, 10 s timeout combined with the deadline signal via `AbortSignal.any`, `content-length` and streamed 1 MB cap, nothing logged
    - `mapLimit` with at most `limit` in progress, results in input order
    - Create `tests/support/fresh-fakes.ts` with `FakeFeedFetcher` (scripted bodies, statuses, delays, oversize, peak in-flight count, key detection) and a fake clock with a fake deadline timer
    - _Requirements: 4.1, 4.4, 18.3, 19.16_
  - [x] 5.6 Write property test for feed fetch concurrency
    - **Property 11: Feed fetch concurrency**
    - **Validates: Requirements 4.1**
  - [x] 5.7 Implement `server/utils/fresh/feed-window.ts`
    - `keepEntries` (strict lower bound, upper bound at check start, newest 15), `mergeEntries` (lowest channel id wins, stored ids removed, published desc then id asc), `chooseForJudge` (newest 40, ties by id asc)
    - _Requirements: 4.2, 4.3, 4.6, 6.1, 6.12_
  - [x] 5.8 Write property test for the feed window
    - **Property 12: Feed window**
    - **Validates: Requirements 4.2, 4.3**
  - [x] 5.9 Write property test for the feed merge
    - **Property 13: Feed merge**
    - **Validates: Requirements 4.6**

- [x] 6. Fresh Judge
  - [x] 6.1 Implement `server/utils/fresh/fresh-judge.ts` and the prompt
    - `freshVerdictSchema`, `freshJudgeOutputSchema`, `buildFreshJudgeInput` (hobby, language, 1 to 60 titles, per video id, title, 500-char description via `truncateDescription`, channel, duration)
    - `quotesSource` over Normalized words with the full description; `applyFreshVerdicts` (whole-response discard on schema or `why` length failure; ignore unknown ids; drop missing or duplicate verdicts, non-instruction, under 0.5, null or unknown title, quotes; keep trimmed `why` and `level`)
    - Create `server/prompts/fresh-judge.md` with the own-words, one-sentence, 120-character instruction and the title and level rules
    - _Requirements: 6.2, 6.4, 6.5, 6.7, 6.8, 6.9, 6.10, 6.11, 6.13_
  - [x] 6.2 Write property test for the Judge input
    - **Property 19: Judge input**
    - **Validates: Requirements 6.2**
  - [x] 6.3 Write property test for verdict handling
    - **Property 20: Fresh verdict handling**
    - **Validates: Requirements 6.4, 6.5, 6.7, 6.8, 6.10, 6.13**
  - [x] 6.4 Write property test for the quote check
    - **Property 21: Quote check**
    - **Validates: Requirements 6.9**
  - [x] 6.5 Write unit tests for verdict drops
    - `is_instruction` false, 0.49, null title and unknown title drop; 0.5 keeps; 6 copied words drop, 5 keep
    - _Requirements: 19.6_

- [x] 7. Channel_Sources and scheduling logic
  - [x] 7.1 Implement `server/utils/fresh/sources.ts`
    - `QUALIFYING_MIN`, `SOURCES_PER_KEY`, `ChannelSourceRow`, `refreshSources` (steps 1 to 4 of design), `rankChannelSources` (count desc, latest qualifying desc, channel id asc by code point, top 15)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.10_
  - [x] 7.2 Write property test for Channel_Source refresh
    - **Property 1: Channel_Source refresh matches the model**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8**
  - [x] 7.3 Write property test for the top-15 ranking
    - **Property 2: Channel_Source top-15 ranking**
    - **Validates: Requirements 1.5**
  - [x] 7.4 Implement `server/utils/fresh/schedule.ts`
    - Constants `CHECKS_PER_CALL`, `START_WINDOW_MS`, `CHECK_INTERVAL_S`, `ACTIVE_PATH_S`, `CALL_DEADLINE_MS`, `STORE_RESERVE_MS`
    - `activeCheckKeys` (normalize hobbies, `languageCode`, add `en`, dedupe), `isDue`, `dueOrder`
    - _Requirements: 3.5, 3.6, 3.7, 3.16_
  - [x] 7.5 Write property test for the due rule and order
    - **Property 6: Due rule and due order**
    - **Validates: Requirements 3.5, 3.6**

- [x] 8. Database migrations
  - [x] 8.1 Create `supabase/migrations/20261112000000_fresh_tables.sql`
    - `video_pools` columns `hobby_norm`, `skill_norm`, `language` with backfill and indexes
    - Tables `fresh_channel_sources`, `fresh_items` (with indexes), `fresh_check_state`; RLS on, no policies, revoked from `public`, `anon`, `authenticated`, granted to `service_role`
    - Functions `fresh_sources_refresh`, replaced `video_pool_store` (writes the key columns and calls `fresh_sources_refresh` in the same transaction), `fresh_items_cleanup`, `fresh_active_hobbies` (raw language, no `coalesce`), `fresh_check_states`, `fresh_lease_take` (lease plus Last_Attempt_Time), `fresh_sources_of`, `fresh_stored_ids`, `fresh_skill_titles`, `fresh_check_store` (deadline check before and after writes, lease check, `on conflict do nothing`), `fresh_page_read` (limits 20 keys and 60 pool keys, 7-day and 30-day filters); all `security definer`, `search_path = public`, `service_role` only; `collate "C"` for tie-breaks
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 3.7, 3.9, 3.15, 3.16, 4.6, 6.2, 7.1, 7.2, 7.3, 7.4, 7.7, 7.9, 7.10, 8.1, 8.10_
  - [x] 8.2 Create `supabase/migrations/20261112000100_fresh_user.sql`
    - `paths.last_opened_at`, `touch_path_opened` (at most once per hour, own rows only)
    - `channel_mutes` with owner-only RLS policy and `merge_channel_mutes` (later time wins, muted true on a tie, `user_id` forced to `auth.uid()`, invalid ids raise)
    - `video_events.snapshot` jsonb with size check and `video_events.snapshot_at` timestamptz; replaced `merge_video_events`: `saved` and `saved_at` unchanged, snapshot and `snapshot_at` chosen independently (present over missing, later `snapshot_at` wins, on equal `snapshot_at` the smaller `concat_ws(chr(31), ...)` text with `collate "C"`; a removal never clears the snapshot)
    - _Requirements: 2.3, 2.4, 2.6, 2.10, 3.10, 17.10_
  - [x] 8.3 Create `supabase/migrations/20261112000200_fresh_check_cron.sql`
    - Job `fresh-check`, `*/15 * * * *`, pg_net `POST <app url>/api/fresh/check` with header `x-fresh-check-secret` from Vault `fresh_check_secret`, `timeout_milliseconds := 120000`; no call when a Vault value is empty
    - _Requirements: 3.1, 3.2_
  - [x] 8.4 Write database integration tests in `tests/integration/fresh-db.test.ts`
    - Skipped unless a local test database URL is set; Client roles cannot read or write `fresh_items`, `fresh_channel_sources`, `fresh_check_state`, `video_leases`; `channel_mutes`, `video_events.snapshot` and `video_events.snapshot_at` are owner-only; `merge_channel_mutes`, `merge_video_events` and `fresh_sources_refresh` match their TypeScript mirrors on generated rows; a failed pool store adds no Channel_Source
    - _Requirements: 1.6, 1.9, 2.4, 7.7, 19.1, 19.16_

- [x] 9. Check store and the Fresh_Check run
  - [x] 9.1 Define the `FreshStore` interface and the in-memory store
    - `server/utils/fresh/check-store.ts` with `DueState`, `FreshItemRow`, `PageRead` and the `FreshStore` methods of design
    - `server/utils/fresh/check-store-memory.ts` with an injected clock, sharing lease, pool and quota maps with `InMemoryPipelineStore`, and running `refreshSources` on pool stores
    - Extend `tests/support/fresh-fakes.ts` with scripted Fresh verdicts and a store factory
    - _Requirements: 1.6, 3.9, 7.1, 7.2, 7.5, 7.9, 19.16_
  - [x] 9.2 Implement `server/utils/fresh/check-store-pg.ts`
    - Calls the SQL functions of task 8.1 through the service-role client; maps a raised `deadline_exceeded` to the same outcome; races calls against the deadline signal
    - _Requirements: 3.15, 7.1, 7.5, 7.7, 7.9_
  - [x] 9.3 Add `detailsBatch` to `server/utils/video/details.ts`
    - One `getDetails` call with quota-exceeded marking; rewrite `fetchDetails` to use it in its existing sequential loop with no behavior change
    - _Requirements: 5.1, 5.3_
  - [x] 9.4 Implement `runFreshCheck` in `server/utils/fresh/check.ts`
    - Stages of the Fresh_Check flowchart: sources, feeds through `mapLimit` (8), window, merge, reserve all units first, parallel details batches, channel id fallback, `filterCandidates` with the key language and `quickTip: false`, pools check, `chooseForJudge`, one `generateStructured` call (Default_Config, 30 s plus deadline, no retry), `applyFreshVerdicts`, `storeCheck`
    - Deadline precedence after every stage and on every error; no store start with less than 3 s left; release the Lease on failure; log `{ checkKey, type }` with one fixed type; never throw
    - _Requirements: 3.15, 4.1, 4.4, 4.5, 4.7, 4.13, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.3, 6.6, 6.12, 7.1, 7.5, 7.6, 7.9_
  - [x] 9.5 Write property test for all-or-nothing checks
    - **Property 16: Fresh_Check is all or nothing**
    - **Validates: Requirements 3.15, 4.4, 4.5, 4.7, 5.2, 5.3, 5.5, 7.1, 7.2, 7.5, 7.6**
  - [x] 9.6 Write property test for details batching
    - **Property 17: Details batching**
    - **Validates: Requirements 5.1, 5.6, 5.7**
  - [x] 9.7 Write property test for Judge selection
    - **Property 18: Judge selection**
    - **Validates: Requirements 6.1, 6.12**
  - [x] 9.8 Write property test for the Lease
    - **Property 10: One Fresh_Check per Check_Key with Lease expiry**
    - **Validates: Requirements 3.9, 7.9**
  - [x] 9.9 Write unit tests for check examples
    - Channel_Source cases at 0.7 and 0.69, null channel id, 16 channels leave 15, failed pool store adds nothing (in-memory)
    - Window bounds with a fixed clock, stored id not sent, 41 videos send the newest 40 and a following check does not read the rest
    - Each failure type leaves data unchanged, releases the Lease and keeps the key due; one failed feed keeps only its last check time
    - Duplicate video id stored once; cleanup at exactly 2592000 s deletes and 2591999 s keeps
    - _Requirements: 19.1, 19.3, 19.5, 19.7_

- [ ] 10. Check_Route
  - [x] 10.1 Implement `handleCheckRequest` in `server/utils/fresh/handlers.ts`
    - Export the shared token and limit helpers from `server/utils/video/handlers.ts` with no behavior change
    - 404 with no secret, 401 on missing or wrong header via `secretsMatch`; Call_Deadline signal at `callStart + 117 s` from an injected timer; cleanup (`cleanup_failed` is logged and the call goes on); active keys, states, due order; loop with limit 3 and the 10 s Start_Window, skipping held Leases without counting; 202 with no secret, Lease or item data
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.12, 3.13, 3.14, 3.15, 7.4, 18.5, 18.6_
  - [ ] 10.2 Wire the Check_Route runtime and config
    - `server/utils/video/runtime.ts`: expose the service-role client and the quota gate factory
    - Create `server/utils/fresh/runtime.ts` (deps from `videoRuntime()`, Postgres store, `freshCheckSecret`, feed fetcher, limiter) and `server/api/fresh/check.post.ts`
    - `nuxt.config.ts`: server-only `runtimeConfig.freshCheckSecret`; `nitro.vercel.functions.maxDuration` 60 → 120
    - Add `NUXT_FRESH_CHECK_SECRET` with a placeholder value to the env example file
    - _Requirements: 3.3, 3.8, 18.1, 18.2_
  - [x] 10.3 Write property test for Check_Route call bounds
    - **Property 7: Check_Route call bounds**
    - **Validates: Requirements 3.3, 3.7, 3.8, 3.12, 3.13, 3.14, 3.15**
  - [x] 10.4 Write property test for the secret gate
    - **Property 8: Secret gate**
    - **Validates: Requirements 3.4**
  - [x] 10.5 Write unit and smoke tests for the Check_Route
    - 4 due keys give at most 3 checks; no start after 10 s; a check started at 10 s finishes; in-flight feed, details or Judge call at 117 s is aborted with `deadline_exceeded`; 2.9 s left skips the store; 15 sources never exceed 8 fetches; inactive hobby over 14 days gets no check; null or empty profile language forms only `en` keys; Lease 300 s rule; never-attempted keys first
    - Smoke: the env example file lists `NUXT_FRESH_CHECK_SECRET`; `freshCheckSecret` is not under `runtimeConfig.public`; `package.json` dependencies unchanged
    - _Requirements: 18.1, 18.2, 18.4, 19.4, 19.17, 19.18_

- [ ] 11. Checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`. Ensure all tests pass, ask the user if questions arise.

- [x] 12. Fresh_Endpoint
  - [x] 12.1 Implement `server/utils/fresh/compose.ts`
    - `composeFreshItems` (Path_Match by Normalized hobby and title only, per-Skill `en` fallback under 3 items, user copy wins, every match listed, `poolLanguage`), `poolCardsFor` (`composeVideos` per window Skill with the path's Goal_Class, limit 24)
    - _Requirements: 6.13, 8.1, 8.11, 8.12, 8.17_
  - [x] 12.2 Write property test for Path_Match and language fallback
    - **Property 22: Path_Match and language fallback**
    - **Validates: Requirements 6.13, 8.1, 8.11, 8.12**
  - [x] 12.3 Implement and wire `handleFreshRequest`
    - `parseFreshRequest` in `server/utils/fresh/handlers.ts` (first invalid field order of design, optional language, null `currentSkillId`); 401 for an unverifiable token before any read; rate limit `user:<id>` or `ip:<addr>`; empty response for 0 paths; one `readPage` call; compose; empty response with `fresh_read_failed` log on any read failure; duration-only timing log; deps without provider, feed fetcher, model adapter or scheduler
    - `loadFreshUserData(token)` in `server/utils/supabase-server.ts` (paths, progress, profile language, events, mutes; Current_Skill, Current_Window, Goal_Class, `activeAt`; empty window when no Current_Skill)
    - Add the endpoint deps to `server/utils/fresh/runtime.ts`; create `server/api/fresh.post.ts`
    - _Requirements: 3.11, 7.8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.13, 8.14, 8.16, 8.17_
  - [x] 12.4 Write property test for the read-only, validating endpoint
    - **Property 23: Fresh_Endpoint is read-only and validates its body**
    - **Validates: Requirements 3.11, 8.2, 8.3, 8.6**
  - [x] 12.5 Write property test that secrets never leak
    - **Property 9: Secrets never leak**
    - **Validates: Requirements 7.6, 18.5, 18.6**
  - [x] 12.6 Write property test for the missing-language rule
    - **Property 40: Missing language gives `en`, never `und`**
    - **Validates: Requirements 3.16, 8.2, 8.16**
  - [x] 12.7 Write property test for paths with no Current_Skill
    - **Property 41: Paths with no Current_Skill**
    - **Validates: Requirements 8.17, 9.3**
  - [x] 12.8 Write unit tests for the Fresh_Endpoint
    - 0 provider, model, feed and fill calls for both request kinds; `none` Goal_Class and IP limit for signed-out requests; 401 with no read for a bad token; each invalid body of 19.18 gives 400 with its field; missing language reads `en` keys; null `currentSkillId` accepted; `en` fallback; 7-day filter; Level mismatch still matches
    - Import boundary: `handleFreshRequest` does not import `check.ts`, `feed-fetch.ts` or the provider
    - _Requirements: 19.12, 19.18_

- [x] 13. Client data layer
  - [x] 13.1 Implement the Channel_Mute store on the Client
    - `app/utils/channel-mutes-store.ts` (`pursio-channel-mutes:v1`)
    - `app/utils/cloud-api.ts`: `mergeChannelMutes`, `touchPathOpened`
    - `app/composables/useChannelMutes.ts`: local store when signed out; pending-then-send through `createSaveQueue` when signed in, retry after 30 s and at next start with the original `changedAt`; move local mutes on sign-in and delete only after success; shown state `mergeMuteLists(cloud, local)`; reject invalid ids before storing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.10_
  - [x] 13.2 Write property test for the local mute store round trip
    - **Property 5: Local mute store round trip**
    - **Validates: Requirements 2.5**
  - [x] 13.3 Write property test for channel id validation
    - **Property 4: Channel id validation**
    - **Validates: Requirements 2.10**
  - [x] 13.4 Write unit tests for mutes
    - Later change time wins; a with b equals b with a; a failed cloud write keeps the switch state and retries with the original time
    - _Requirements: 2.7, 19.15_
  - [x] 13.5 Extend `useVideoEvents` for snapshots
    - `recordSave(videoId, saved, 'feed', snapshot)`; `mergedEvents(cloudRows)`; `app/utils/video-events-store.ts` carries `snapshot` and `snapshotAt` through parse and serialize
    - _Requirements: 17.4, 17.8, 17.10_
  - [x] 13.6 Implement the Fresh request layer
    - `app/utils/fresh-api.ts` (typed client and response parser for `POST /api/fresh`)
    - `app/utils/fresh-request.ts` (signed-out body from the hobby library, Demo_Mode body from the Sample_Tree and its local Progress, `findCurrentNodeId`, language from user settings, paths by local activity)
    - `app/composables/useFresh.ts` (10 s timeout, `loading | error | ready`, `retry()` sending exactly one request, 60 s relative-time tick)
    - _Requirements: 8.2, 8.15, 11.5, 16.4, 16.5, 16.6, 18.7_
  - [x] 13.7 Write unit tests for the request layer
    - Error after a failed or slow request; one request per retry with the button disabled while pending; Demo_Mode body holds the Demo_Paths and no token
    - _Requirements: 19.13, 19.20_

- [ ] 14. Checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`. Ensure all tests pass, ask the user if questions arise.

- [x] 15. Navigation and Path page
  - [x] 15.1 Add the Fresh navigation item
    - New inline stroke icon `spark` in `app/utils/icons.ts`
    - `app/components/path/PathNavItems.vue`: Fresh between Path and Quests, `/fresh` or `/fresh?demo=1`, `aria-current` only on Fresh at `/fresh`, Path links to `/path?demo=1` in Demo_Mode, bottom items `w-22` with 44 px targets, same focus classes, updated doc comment
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_
  - [x] 15.2 Open a Skill_Sheet from the URL and record path opens
    - `app/components/path/PathView.vue`: optional `initialSkillId` opens that Skill_Sheet once after mount
    - `app/pages/path.vue`: read the `skill` query; call `touchPathOpened` once per open for a Signed_In_User's cloud path
    - _Requirements: 3.10, 13.4_
  - [x] 15.3 Write unit tests for navigation
    - Fresh between Path and Quests; `aria-current` on Fresh only; Demo_Mode links; `w-22` items; accessible name "Fresh"; icon present in the icon set
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6, 10.8_

- [x] 16. Fresh_Page UI
  - [x] 16.1 Extend `app/components/watch/WatchVideoCard.vue`
    - Optional `layout` (`stack` | `list`), `meta` and `actions` slots, skip timer only while the tab is visible; existing uses unchanged
    - _Requirements: 13.3, 13.9, 17.5_
  - [x] 16.2 Create the card building blocks
    - `FreshSaveButton.vue` (`aria-pressed`), `FreshMuteSwitch.vue` (`role="switch"`, name with full channel name and state, Enter and Space), `FreshVideoCard.vue` (wraps `WatchVideoCard` with Why_Line, skill tag link, "New" badge, language label, save control; snapshot thumbnails only when `isAllowedThumbnail`)
    - Token utilities only; no XP text
    - _Requirements: 11.8, 11.9, 13.2, 13.4, 13.8, 13.10, 13.11, 13.12, 15.10, 18.3_
  - [x] 16.3 Create `FreshHeroCard.vue` and `FreshSection.vue`
    - Hero with label, thumbnail, duration badge, title, channel, Why_Line (Fresh_Item only), Watch and Save; section heading with grid 1, 2 or 3 columns (`md:grid-cols-2 lg:grid-cols-3`), list cards below `md`
    - _Requirements: 12.1, 12.2, 12.5, 13.1, 13.3, 13.5_
  - [x] 16.4 Create `FreshHeader.vue`, `FreshFilterChips.vue` and `FreshState.vue`
    - Header title, filter label, "Updated <time>", mobile "Sources" button; chips with radio-group semantics; Wick states for loading (thinking), no paths with "Build your first path", quiet line, empty line, saved-empty line, error with "Try again"
    - _Requirements: 11.2, 11.3, 11.6, 14.1, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_
  - [x] 16.5 Create `FreshSourcesPanel.vue` and `FreshSourcesSheet.vue`
    - Groups by hobby, entries with mute switches (hidden in Demo_Mode), "No sources yet for <hobby>." line, the fixed note; mobile sheet with `useFocusTrap`, close button, Escape, focus back to the "Sources" button
    - _Requirements: 11.10, 15.1, 15.2, 15.3, 15.4, 15.5, 15.8, 15.9, 15.10_
  - [x] 16.6 Create `app/pages/fresh.vue` and wire everything
    - `AppShell`; desktop `lg` grid with right column, mobile one column with the sheet
    - `useFresh`, `useChannelMutes`, `useVideoEvents` (not used in Demo_Mode); `computed` `buildFreshView` over response, chip ("All skills" default), mutes and merged events
    - One `activeVideoId` so one player plays at a time; record play, progress (5 s), finish (80 percent), save with snapshot, skip (2 s, 50 percent visible, no played time) with Source `feed`; flush progress on stop, chip or mute hide and page leave; never call the progress engine
    - Demo_Mode: Demo_Paths request, no mute switch, save control or "Saved" chip, no writes
    - _Requirements: 8.15, 11.1, 11.2, 11.7, 12.5, 12.6, 12.8, 13.6, 13.7, 13.13, 14.2, 14.8, 14.11, 15.6, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.9, 18.7_
  - [x] 16.7 Write unit tests for the Fresh_Page behavior
    - Page states with the composable and the pure view: no paths, quiet line, empty line, no update time, error with "Try again" [19.13]
    - Play, finish and save record Source `feed`; a save stores every snapshot field; XP, level and streak unchanged [19.14]
    - Chips and mute changes cause 0 new requests; "For <current skill>" hidden without a Current_Skill; "Saved" order and no Hero_Card; one video plays at a time [19.19]
    - Demo_Mode writes 0 mutes, events and snapshots after play, finish and skip [19.20]
    - "Saved" shows a video from its snapshot after its Fresh_Item was deleted [19.21]
    - Extend `tests/unit/conventions.test.ts` to cover `app/components/fresh/*` and `app/pages/fresh.vue`
    - _Requirements: 11.8, 19.13, 19.14, 19.19, 19.20, 19.21_

- [ ] 17. Checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`. Ensure all tests pass, ask the user if questions arise.

- [x] 18. Changelog
  - [x] 18.1 Add the CHANGELOG.md entry
    - Under `## [Unreleased]` → `### Added`, one user-facing line, for example: "Fresh page with new videos every day from good channels for the skills on your paths, plus the best videos for your current skills, with channel mutes and saved videos (spec: fresh)"
    - Do not rewrite existing entries
    - _Requirements: 10.1, 11.1_

- [ ] 19. Final checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability; every design property (1 to 41) has its own property test sub-task.
- Property tests use fast-check with at least 100 runs and the tag `// Feature: fresh, Property N: <title>`.
- Every test uses fakes (feed fetcher, provider, Judge, clock); no test makes a network call or uses the production database. Database tests are skipped without a local test database.
- No new dependency is added. Real env files are never read; the new key goes into the env example file only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.4"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "2.3"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.5", "2.6", "3.1", "5.1", "6.1", "7.1", "7.4", "8.1", "8.2", "8.3"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "5.2", "5.3", "5.4", "5.5", "6.2", "6.3", "6.4", "6.5", "7.2", "7.3", "7.5", "8.4", "9.3"] },
    { "id": 4, "tasks": ["3.6", "3.7", "5.6", "5.7", "9.1"] },
    { "id": 5, "tasks": ["3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14", "3.15", "3.16", "3.17", "5.8", "5.9", "9.2", "9.4"] },
    { "id": 6, "tasks": ["9.5", "9.6", "9.7", "9.8", "9.9", "10.1"] },
    { "id": 7, "tasks": ["10.2", "12.1"] },
    { "id": 8, "tasks": ["10.3", "10.4", "10.5", "12.2", "12.3"] },
    { "id": 9, "tasks": ["12.4", "12.5", "12.6", "12.7", "12.8", "13.1", "13.5", "13.6"] },
    { "id": 10, "tasks": ["13.2", "13.3", "13.4", "13.7", "15.1", "15.2", "16.1"] },
    { "id": 11, "tasks": ["15.3", "16.2", "16.4"] },
    { "id": 12, "tasks": ["16.3", "16.5"] },
    { "id": 13, "tasks": ["16.6"] },
    { "id": 14, "tasks": ["16.7", "18.1"] }
  ]
}
```
