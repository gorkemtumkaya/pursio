# Implementation Plan: accounts-cloud-save

## Overview

The plan has 7 top-level tasks, matching the delivery table in `design.md` (Req 1.1). Language: TypeScript (strict), Nuxt 4, Vue 3 `<script setup lang="ts">`, yarn.

- Task 1 is gated on the user's explicit approval of the `@supabase/supabase-js` install. Nothing that imports the package starts before task 1 is done (tasks 4, 5 and 6 depend on it).
- Tests cover logic only: pure functions and server handlers with fakes. There are no Vue component tests, no live Supabase calls and no RLS tests (Req 13.4, 13.5). RLS is checked by the `supabase/README.md` checklist.
- Secrets rule: no task reads, opens, searches, prints or edits any environment file that holds real secrets. Only the example env file (placeholder values) may be read or edited. Never write a key value into code, logs, chat or commits (Req 1.6).

## Tasks

- [ ] 1. Approval-gated install of `@supabase/supabase-js`, runtime config and dependency allowlist
  - **Gate: explicit user approval is required before any install command runs (Req 1.9).** Do not start 1.2 until 1.1 has an approving answer. Tasks 4, 5 and 6 must not start before this task is complete.
  - [x] 1.1 Ask the user to approve the new dependency
    - Use the `user_input` tool. State the package `@supabase/supabase-js`, the exact version to pin (2.119.0, verified as latest; needs Node 22 or newer, the project runs Node 24), and that it is loaded with a dynamic `import()` on the client only.
    - Offer "Approve 2.119.0", and let the user name another exact version or decline.
    - If the user declines, stop this task and report back. Do not run `yarn add`.
    - _Requirements: 1.2, 1.9_

  - [x] 1.2 Install the package at one exact version (only after approval in 1.1)
    - Run `yarn add --exact @supabase/supabase-js@<approved version>`.
    - Confirm `package.json` lists the version with no `^`, `~` or other range operator, and that no other package was added (production or development).
    - _Requirements: 1.2, 1.9_

  - [ ] 1.3 Add the server-only runtime key and fix the example env comment
    - In `nuxt.config.ts` add top-level `supabaseServiceRoleKey: ''` (server-only). Leave `public.supabaseUrl` and `public.supabaseAnonKey` as they are.
    - In the example env file (the one with placeholder values, see the Config section of `design.md`) change only the comment `# Server-only (later)` to `# Server-only`. Confirm each of `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY` and `NUXT_SUPABASE_SERVICE_ROLE_KEY` appears exactly once with a placeholder value. Open no other environment file.
    - _Requirements: 1.3, 1.4, 1.6_

  - [x] 1.4 Update the dependency allowlist in `tests/unit/conventions.test.ts` (same task as the install)
    - Add `@supabase/supabase-js` to the allowed `dependencies` list so it reads `@supabase/supabase-js, elkjs, nuxt, vue, vue-router, zod`, and make sure the exact-version check covers it. Otherwise `yarn test` fails after 1.2.
    - Add a check that the string `supabaseServiceRoleKey` appears only in `nuxt.config.ts` and `server/utils/account-runtime.ts` (scan `app/`, `server/`, `shared/`).
    - Run `yarn test tests/unit/conventions.test.ts` and confirm it passes.
    - _Requirements: 1.2, 1.5_

- [x] 2. Database migrations and Setup_Guide
  - No approval needed. Does not import the package.
  - [x] 2.1 Write `supabase/migrations/20261108000000_schema.sql`
    - Tables `profiles`, `paths`, `progress` exactly as in the design SQL (checks on `display_name` length and `theme`, `level`, unique `(user_id, hobby_id)`, unique `(id, user_id)`, composite foreign key `(path_id, user_id)` to `paths (id, user_id)` with delete cascade).
    - `handle_new_user()` (`security definer`, `set search_path = public`, no exception block) and the `after insert on auth.users` trigger.
    - `before update` trigger setting `progress.updated_at`.
    - `save_generated_path(p_hobby, p_hobby_id, p_level, p_tree, p_mascot_set, p_model) returns uuid`, `security invoker`: upsert on `(user_id, hobby_id)` keeping `id` and `created_at`, set `archived = false`, delete that path's `progress` row, return the id.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.11, 9.8_

  - [x] 2.2 Write `supabase/migrations/20261108000100_rls.sql`
    - `enable row level security` on all three tables and one `for all to authenticated` policy each, with `using` and `with check` on `(select auth.uid())` (`id` for `profiles`, `user_id` for the others). No policy for `anon`.
    - _Requirements: 2.7, 2.8, 2.12_

  - [x] 2.3 Write `supabase/README.md` (Setup_Guide)
    - Sections: apply migrations in name order; dashboard settings (anonymous sign-ins on, manual linking on, Google provider, email provider with "Confirm email", site and redirect URLs for `http://localhost:3000/**` and production, a numeric anonymous sign-in limit per hour per IP with a suggested 30, and the note that the built-in mailer sends 2 emails per hour to project team addresses only, so real magic links need custom SMTP); the three key names only, no values; the RLS checklist.
    - Checklist: one step and one expected result per line, for each of `profiles`, `paths`, `progress`: user B select on A's row gives 0 rows; update and delete give 0 rows affected; insert of a row owned by A gives an RLS error; `anon` select gives 0 rows, `anon` insert gives an error, `anon` update and delete give 0 rows affected. Plus a `progress` row whose `user_id` differs from its path's owner gives a foreign key error.
    - _Requirements: 1.3, 2.9, 2.10, 2.12_

- [x] 3. Pure modules, test generators and logic tests
  - Pure functions only. No import of `@supabase/supabase-js`, so this task does not wait for the approval. Reuse `arbValidTree` and `arbProgress(tree)` from `tests/arbitraries.ts`. Property tests use fast-check with at least 100 runs and a comment `Feature: accounts-cloud-save, Property N: <title>`.
  - [x] 3.1 Create shared types and helpers
    - `shared/types/cloud.ts`: `PathSaveInput`, `PathInsertRow`, `ProgressWriteRow`, `ProfileRow`, `CompletedAt`, `DeleteResponse`.
    - `shared/utils/auth.ts`: `parseBearer(header)` (scheme `Bearer`, case-insensitive, one non-empty token, nothing after it) and `bearerHeader(token)`.
    - `shared/utils/cloud-path.ts`: `buildSaveArgs(input)` returning the six `rpc` arguments (`hobby`, `hobby_id = normalizeHobby(tree.hobby)`, `level`, `tree`, `mascot_set = tree.mascot.set`, `model`).
    - _Requirements: 9.1, 9.7, 11.10_

  - [x] 3.2 Create `app/utils/auth-logic.ts` and `app/utils/deadline.ts`
    - `isValidEmail`, `callbackFailure(url)` (query and hash), `classifyAuthError`, `AUTH_MESSAGES` with the exact sentences of Req 3.5, 4.4, 4.5, 4.8, 4.9, 9.11, 11.12, 11.16, `shouldShowSavePrompt`, `sessionView`, `normalizeDisplayName`.
    - `raceDeadline(promise, ms)` in `deadline.ts`.
    - _Requirements: 3.3, 3.5, 4.2, 4.4, 4.5, 4.8, 4.9, 4.13, 7.4, 10.7_

  - [x] 3.3 Create `app/utils/cloud-library.ts`
    - `CloudPath` type, `toHobbyLibrary`, `cloudEntries`, `completionTimes` (archived paths included), `stampCompletions`, `upsertGenerated`, `withoutPath`, `withArchived`, `withPath`. Reuse `pickHobby`, `nextHobbyId`, `completionPercent` and the existing types from `hobby-store.ts`.
    - _Requirements: 5.2, 5.5, 5.6, 5.7, 6.6, 6.8, 6.9_

  - [x] 3.4 Create `app/utils/cloud-rows.ts`
    - `parsePathRow` (zod columns, `loadSkillTree`, non-empty `model`, Hobby_Id recomputed with `hobbyId(tree)`, `addedAt` from `created_at`), `parseProgressRow` (validate with `storedProgressSchema`, drop unknown ids, collapse duplicates, keep timestamps only for completed known Nodes), `toPathInsertRow`, `toProgressRow`.
    - _Requirements: 5.4, 5.10, 6.10, 6.12_

  - [x] 3.5 Create `app/utils/save-queue.ts`
    - `createSaveQueue<T>(write, { onFailure, onSuccess })` returning `{ push, retry }`: one write in flight, one waiting value (latest wins), after a failure nothing is sent until `retry()` or the next `push`.
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [x] 3.6 Create `app/utils/active-hobby.ts`
    - `getActiveHobbyId`, `setActiveHobbyId`, `clearActiveHobbyId`, `isSavePromptDismissed`, `dismissSavePrompt` with keys `pursio-active-hobby:v1` and `pursio-save-prompt-dismissed:v1`. Every storage access in try/catch; a failed read means not set, a failed write is ignored; the dismissed flag is also kept in memory for the page session.
    - _Requirements: 5.3, 5.8, 10.3, 10.8_

  - [x] 3.7 Create `app/utils/legacy-import.ts`
    - `readLegacyData(getStorage)` (read-only; does not call `loadHobbyLibrary`; returns `null` when no Legacy_Data key exists), `planImport(legacy, existingPathCount, ctx)` (pure; timestamp rule from the Completion_Log; `activeHobbyId`), `runLegacyImport(api, plan, deadlineMs = 10_000)` (two array inserts, compensating `deletePaths` on any error or deadline), `clearLegacyData(getStorage)` (never touches the Sample_Tree key, theme or LLM_Settings).
    - Declare the small `api` shape it needs (`insertPaths`, `insertProgress`, `deletePaths`) inside this file, so `CloudApi` from task 6 satisfies it structurally.
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9_

  - [x] 3.8 Rename the Rate_Limiter parameter from `ip` to `key`
    - Edit `server/utils/rate-limiter.ts` only. Logic and limit (10 per 60-minute sliding window) stay the same.
    - _Requirements: 9.4, 9.6_

  - [x] 3.9 Add generators to `tests/arbitraries.ts`
    - `arbCloudPath`, `arbCloudPaths` (with and without archived entries), `arbLegacyData` (valid and invalid entries, `activeId` present or absent), `arbCompletionLog`, `arbRequestSequence` (user ids with non-decreasing times), `arbCallbackUrl`, `arbAuthError`. Do not change existing exports.
    - _Requirements: 13.1_

  - [x]* 3.10 Write property test for the Path_Row round trip
    - File `tests/property/cloud-rows.property.test.ts`.
    - **Property 1: Path_Row round trip**
    - **Validates: Requirements 5.10**

  - [x]* 3.11 Write property test for the Progress_Row round trip
    - File `tests/property/cloud-rows.property.test.ts`.
    - **Property 2: Progress_Row round trip**
    - **Validates: Requirements 6.12**

  - [x]* 3.12 Write property test for loaded Progress holding only Nodes of the tree
    - File `tests/property/cloud-rows.property.test.ts`.
    - **Property 3: Loaded Progress holds only Nodes of the tree**
    - **Validates: Requirements 6.10**

  - [x]* 3.13 Write property test for reversible archive, delete and Undo
    - File `tests/property/cloud-library.property.test.ts`.
    - **Property 4: Archive, delete and Undo are reversible on the library**
    - **Validates: Requirements 5.5, 5.6, 5.7, 6.9**

  - [x]* 3.14 Write property test for stable Completion_Timestamps
    - File `tests/property/cloud-library.property.test.ts`.
    - **Property 5: Completion_Timestamps are stable**
    - **Validates: Requirements 6.6**

  - [x]* 3.15 Write property test for Streak and Week counting every timestamp once
    - File `tests/property/cloud-library.property.test.ts`.
    - **Property 6: Streak and Week count every timestamp once**
    - **Validates: Requirements 6.8**

  - [x]* 3.16 Write property test for the Save_Queue
    - File `tests/property/save-queue.property.test.ts`. Use fake timers and a mocked async writer with random delays.
    - **Property 7: Save_Queue writes one at a time and ends on the last value**
    - **Validates: Requirements 6.3**

  - [x]* 3.17 Write property test for the import plan
    - File `tests/property/legacy-import.property.test.ts`.
    - **Property 8: The import plan mirrors the valid entries**
    - **Validates: Requirements 8.1, 8.2, 8.4, 8.6, 8.7**

  - [x]* 3.18 Write property test for import timestamps
    - File `tests/property/legacy-import.property.test.ts`.
    - **Property 9: Import timestamps follow the Completion_Log**
    - **Validates: Requirements 8.3**

  - [x]* 3.19 Write property test for import idempotence
    - File `tests/property/legacy-import.property.test.ts`. Use an in-memory row set.
    - **Property 10: Importing twice equals importing once**
    - **Validates: Requirements 8.9**

  - [x]* 3.20 Write property test for the per-user Rate_Limiter
    - File `tests/property/rate-limiter.property.test.ts`. Compare against a reference model.
    - **Property 11: The Rate_Limiter decides per user id**
    - **Validates: Requirements 9.4, 9.6**

  - [x]* 3.21 Write property test for email validity
    - File `tests/property/auth-logic.property.test.ts`.
    - **Property 17: Email validity matches the definition**
    - **Validates: Requirements 4.2, 4.4**

  - [x]* 3.22 Write property test for auth failure classification
    - File `tests/property/auth-logic.property.test.ts`.
    - **Property 18: Auth failures are classified**
    - **Validates: Requirements 4.5, 4.9, 4.13**

  - [x]* 3.23 Write property test for the Save_Prompt decision
    - File `tests/property/auth-logic.property.test.ts`. Cover all 16 combinations.
    - **Property 19: The Save_Prompt decision**
    - **Validates: Requirements 10.7**

  - [x]* 3.24 Write property test for the session view
    - File `tests/property/auth-logic.property.test.ts`.
    - **Property 20: The session view hides what is not known yet**
    - **Validates: Requirements 3.2, 3.3**

  - [x]* 3.25 Write property test for Bearer parsing
    - File `tests/property/auth-logic.property.test.ts`.
    - **Property 21: Bearer parsing**
    - **Validates: Requirements 9.1, 11.10**

  - [x]* 3.26 Write property test for display name trimming
    - File `tests/property/auth-logic.property.test.ts`.
    - **Property 22: Display names are trimmed**
    - **Validates: Requirements 7.4**

  - [x]* 3.27 Write unit tests for `cloud-rows`
    - File `tests/unit/cloud-rows.test.ts`: a row with a rejected tree or an empty model is skipped while others load; progress with unknown ids is pruned; an empty row gives empty Progress.
    - _Requirements: 5.4, 6.10_

  - [x]* 3.28 Write unit tests for `cloud-library`
    - File `tests/unit/cloud-library.test.ts`: `upsertGenerated` replaces in place, keeps `addedAt`, resets progress and `archived`; no timestamps gives Streak 0 and no done days.
    - _Requirements: 6.8, 9.8_

  - [x]* 3.29 Write unit tests for the Save_Queue
    - File `tests/unit/save-queue.test.ts`: a failure keeps the latest value and sends nothing; `retry` sends it; a `push` after a failure writes.
    - _Requirements: 6.4, 6.5_

  - [x]* 3.30 Write unit tests for the Legacy_Importer
    - File `tests/unit/legacy-import.test.ts`: `readLegacyData` writes nothing (storage spy); library plus Generated_Tree; all entries invalid gives an empty plan; a failing second insert calls `deletePaths` with the plan ids; a missed deadline does the same; `clearLegacyData` removes exactly the Legacy_Data keys and leaves the Sample_Tree key, theme and LLM_Settings.
    - _Requirements: 8.3, 8.4, 8.5, 8.7_

  - [x]* 3.31 Write unit tests for the Rate_Limiter
    - File `tests/unit/rate-limiter.test.ts`: window edge, separate buckets per user id.
    - _Requirements: 9.4, 9.6_

  - [x]* 3.32 Write unit tests for `auth-logic`
    - File `tests/unit/auth-logic.test.ts`: the fixed message strings; `callbackFailure` with real-looking Supabase URLs (expired link, `identity_already_exists`, cancelled Google flow); `classifyAuthError`; `shouldShowSavePrompt` for all 16 combinations written out.
    - _Requirements: 4.5, 4.9, 4.13, 10.7_

  - [x]* 3.33 Write unit tests for `active-hobby`
    - File `tests/unit/active-hobby.test.ts`: get, set, clear; a throwing storage reads as unset and writes are ignored.
    - _Requirements: 5.3, 10.8_

- [x] 4. Server: token check, per-user tree route, delete account route
  - Depends on task 1 (the package is imported in `supabase-server.ts` and `account-runtime.ts`). Reads no environment file; `supabaseServiceRoleKey` is read only in `server/utils/account-runtime.ts`. Logs hold error codes only, never tokens, keys, bodies or Supabase messages.
  - [x] 4.1 Add the new error codes, response field and Friendly_Messages
    - `shared/types/llm.ts`, `shared/utils/llm.ts`: `ErrorCode` and `ERROR_CODES` gain `unauthorized` and `save_failed`; the success `TreeResponse` gains `pathId: string`.
    - `app/utils/tree-client.ts`: `MESSAGES` gains "Your session ended. Reload the page and try again." for `unauthorized` and "We built your tree but couldn't save it. Try again." for `save_failed`.
    - _Requirements: 9.9, 9.11_

  - [x] 4.2 Create `server/utils/supabase-server.ts`
    - `verifyAccessToken(token, signal)`: `getUser(token)` on a shared client without session storage; returns `user.id` or `null`; empty URL or anon key returns `null`.
    - `savePathForUser(token, input, signal)`: a client with `global.headers.Authorization = Bearer <token>`, `rpc('save_generated_path', buildSaveArgs(input))`, returns the uuid string or throws. Does not use the service role key.
    - _Requirements: 9.1, 9.7, 9.8, 9.13_

  - [x] 4.3 Create the delete account route
    - `server/utils/account-handlers.ts`: `handleDeleteAccount({ authorization }, deps)`: `parseBearer` then `deps.verifyToken`, failure gives 401 `unauthorized`; empty or whitespace key gives 503 `no_key`; `deps.deleteUser(userId)` once, failure gives 502 `delete_failed`, success gives 200 `{ ok: true }`. Never reads URL or body.
    - `server/utils/account-runtime.ts`: `accountDeleteDeps()`, the only reader of `useRuntimeConfig().supabaseServiceRoleKey`; `deleteUser` uses `auth.admin.deleteUser` on a client with `persistSession: false, autoRefreshToken: false`.
    - `server/api/account.delete.ts`: sets the status and returns the body, like `tree.post.ts`.
    - _Requirements: 1.5, 1.7, 1.8, 11.9, 11.10, 11.11, 11.14, 11.17_

  - [x] 4.4 Change `handleTreeRequest` and its wiring
    - `server/utils/llm-handlers.ts`: input takes `authorization` instead of `ip`. Order: `parseBearer`, `verifyToken` under 5 s (401 on null, throw or timeout, nothing else runs), then existing hobby, level, provider config and Tree_Cache steps; `limiter.tryConsume(userId)` only for a Default_Config cache miss; cache the tree before saving; `savePath(token, { hobby, level, tree, model })` under 10 s; failure gives 502 `save_failed`; success gives 200 `{ tree, model, pathId }`. `TreeDeps` gains `verifyToken`, `savePath`, `verifyTimeoutMs` (5000), `saveTimeoutMs` (10000). `ERROR_STATUS` gains `unauthorized: 401`, `save_failed: 502`. The user id comes from the verified token only; body `userId` or `user_id` is never read.
    - `server/utils/llm-runtime.ts`: `llmTreeDeps()` adds `verifyToken` and `savePath`.
    - `server/api/tree.post.ts`: pass `getHeader(event, 'authorization')`, drop `getRequestIP`.
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8, 9.9, 9.10, 9.13_

  - [x]* 4.5 Write property test for unauthorized requests
    - File `tests/property/tree-route.property.test.ts`. Also create the shared fake `TreeDeps` helper used by the other tree-route tests (fake adapters, spy limiter, map-backed cache, fake `verifyToken` and `savePath`) in `tests/support/tree-deps.ts`.
    - **Property 12: An unauthorized request does nothing else**
    - **Validates: Requirements 9.1, 9.2**

  - [x]* 4.6 Write property test for using only the verified user id
    - File `tests/property/tree-route.property.test.ts`.
    - **Property 13: Only the verified user id is used**
    - **Validates: Requirements 9.4, 9.7**

  - [x]* 4.7 Write property test for counting only billable generations
    - File `tests/property/tree-route.property.test.ts`.
    - **Property 14: Only billable generations are counted**
    - **Validates: Requirements 9.5**

  - [x]* 4.8 Write property test for save failure keeping the tree
    - File `tests/property/tree-route.property.test.ts`. Use short `saveTimeoutMs` for the timeout case.
    - **Property 15: A save failure keeps the tree for a free retry**
    - **Validates: Requirements 9.10**

  - [x]* 4.9 Write property test for the delete route
    - File `tests/property/account-route.property.test.ts`. Also create the fake `DeleteDeps` helper in `tests/support/account-deps.ts`.
    - **Property 16: The delete route deletes only the verified user**
    - **Validates: Requirements 11.9, 11.10, 11.11, 11.14**

  - [x]* 4.10 Write unit tests for the tree route handler
    - File `tests/unit/tree-route.test.ts`: success body `{ tree, model, pathId }`; 401 for missing header, other scheme, rejected token, throwing verifier and verifier timeout; 400 invalid hobby after a valid token; 429 after 10 default-config generations by one user and not for another user; User_Config and cache hits not counted; 502 `save_failed` on throw and on timeout; cache-hit save uses the cached model; `ERROR_STATUS` values.
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.9, 9.10_

  - [x]* 4.11 Write unit tests for the delete route handler
    - File `tests/unit/account-route.test.ts`: 200 `{ ok: true }`; 401 for each bad header form with `deleteUser` not called; 503 for an empty key; 502 `delete_failed`; the log spy receives codes only.
    - _Requirements: 1.7, 1.8, 11.9, 11.10, 11.11, 11.17_

  - [x]* 4.12 Add cases for the two new codes to `tests/unit/tree-client.test.ts`
    - Both Friendly_Messages are returned for `unauthorized` and `save_failed`; existing cases stay unchanged.
    - _Requirements: 9.11_

- [x] 5. Client auth: session, dialogs, profile page
  - Depends on task 1. No component tests. The Cloud_Store is added in task 6, so `profile.vue` here holds only the parts that need auth.
  - [x] 5.1 Create `app/utils/supabase-client.ts`
    - `getSupabase(url, anonKey)`: cached client built with a dynamic `import('@supabase/supabase-js')`; returns `null` when either value is empty. Never called in Demo_Mode.
    - _Requirements: 3.5, 12.1, 12.4, 12.5_

  - [x] 5.2 Create `app/composables/useAuth.ts` (Auth_Service)
    - State in `useState` (status, user id, email, is-anonymous); module-level client and in-flight promise.
    - `ensure()` (callback error check first, `getSession`, else local sign-out and `signInAnonymously`, all raced against 10 s), `retry()`, `accessToken()`, `startGoogle(mode)` (`linkIdentity` for `save`, `signInWithOAuth` for `login`), `sendEmail(mode, email)` (validate first; `updateUser` for `save`, `signInWithOtp` with `shouldCreateUser: false` for `login`; returns `'sent' | 'account_exists' | 'failed'`), `logout()` (`signOut({ scope: 'local' })`, clear Active_Hobby, open `/`), `endSessionAfterDelete()` (ignores sign-out errors), and `onAuthStateChange` handling as in the design (`SIGNED_OUT` calls `ensure()` in a `setTimeout`).
    - Expose status, user id, is-anonymous and email through `sessionView`.
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.7, 3.8, 4.1, 4.2, 4.3, 4.5, 4.6, 4.9, 4.13, 4.15, 11.5, 11.13, 11.16_

  - [x] 5.3 Create `app/middleware/auth.global.ts`
    - On the client, unless `to.path === '/path' && to.query.demo === '1'`, call `void useAuth().ensure()` without awaiting. In Demo_Mode the client is not built, so a stored Session is neither read nor refreshed.
    - _Requirements: 3.1, 3.2, 12.1, 12.4_

  - [x] 5.4 Create the Auth_Dialog pieces and mount them
    - `app/composables/useAuthDialog.ts` (`show(mode, variant)`, `close()`, `open`, `mode`, `variant`, `error`).
    - `app/components/auth/AuthOptions.vue` (Google button, email field, "Email me a link", "Check your email" state, inline errors, buttons disabled while a request runs, no password field, the 4.8 warning in `login` mode for an Anonymous_User with paths), `AuthDialog.vue` (focus trap, Escape, Save_Prompt variant with title, sentence and "Not now"; closes when `isAnonymous` turns false; navigates to `/` in `login` mode when the user id changes), `SessionGate.vue` (slot when `anonymous` or `signed_in`, loading state, or the 3.5 message with "Try again").
    - Mount `AuthDialog` once in `app/app.vue` next to `AppToast`. Token utilities only, no hardcoded colors.
    - _Requirements: 3.4, 3.5, 3.6, 3.7, 4.4, 4.7, 4.8, 4.10, 4.11, 4.12, 4.14, 10.2, 10.3, 10.9, 10.10_

  - [x] 5.5 Add the sticky toast and the busy/error dialog props
    - `app/composables/useToast.ts` and `app/components/AppToast.vue`: `show(message, action, { sticky })`; a sticky toast has no timer and shows a "Dismiss" button. Default behavior unchanged.
    - `app/components/path/PathConfirmDialog.vue`: optional props `busy` (disables both buttons, loading indicator on the confirm button) and `error` (message shown in the dialog). Default behavior unchanged.
    - _Requirements: 6.4, 11.12, 11.15_

  - [x] 5.6 Create `app/pages/profile.vue` and the Profile nav item
    - `profile.vue` inside `SessionGate`: account status ("Guest" or the email), link to `/settings`, "Log in" link for an Anonymous_User, "Log out" for an Account_User only (error text "We couldn't log you out. Try again."), "Delete my account" for everyone with `PathConfirmDialog` (states that paths, progress and profile are deleted for good), `$fetch('/api/account', { method: 'DELETE', headers: bearerHeader(token), signal, retry: 0 })` with a 15 s abort, `busy` while in flight, `error` "We couldn't delete your account. Try again." on failure; on success `endSessionAfterDelete()`, clear Active_Hobby and the dismissed flag, open `/`.
    - `app/components/path/PathNavItems.vue`: Profile item to `/profile` (icon `user`), hidden when `route.query.demo === '1'`. Check that the icon set has a `user` icon; add one in the existing icon style if it is missing.
    - Display name field and the "Save your progress" section are wired in task 6.
    - _Requirements: 10.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.12, 11.13, 11.15, 11.16, 12.6_

- [x] 6. Cloud data: Cloud_Store, pages and Save_Prompt
  - Depends on tasks 3 and 5 (and on 4.4 for `pathId`). Demo_Mode keeps its current local path with no auth and no cloud calls. No component tests; logic is covered by task 3.
  - [x] 6.1 Create `app/utils/cloud-api.ts`
    - `createCloudApi(client, userId): CloudApi` with `listPaths`, `listProgress`, `getProfile`, `updateProfile`, `setArchived`, `deletePath`, `deletePaths`, `insertPaths`, `insertProgress`, `upsertProgress` (`onConflict: 'path_id'`). Every method throws on a Supabase error and returns plain `unknown` rows. No `any`, no decisions.
    - _Requirements: 5.5, 5.6, 5.7, 6.2, 7.2, 7.4, 8.1_

  - [x] 6.2 Create `app/composables/useCloudStore.ts` and `app/plugins/cloud.client.ts`
    - Shared `useState` for `status` (`idle | loading | importing | ready | error`), `paths`, `profile`. The plugin watches `useAuth().userId`: non-empty runs `bootstrap(userId)` with a generation counter; empty clears state.
    - Bootstrap: load and parse paths and progress; if no path rows and `readLegacyData` finds data, set `importing`, run `planImport` and `runLegacyImport`, then set the Active_Hobby and `clearLegacyData` on success, or show the toast "We couldn't import your saved paths. They stay on this device and we'll try again next time." on failure; reload rows either way. A load failure sets `error`. Load the Profile_Row separately and apply a valid, different `theme` through `setTheme`; a bad or missing theme is ignored; a profile failure never blocks paths.
    - Actions: `reload`, `archive`, `restore`, `remove`, `undoRemove` (wait for the database, then change state; on failure keep state and toast "Couldn't save that change. Try again."), `addGenerated`, `progressStore(pathId)` (immediate `stampCompletions`, then `SaveQueue` writer `upsertProgress`; sticky toast "Couldn't save your last change." with "Retry"; success dismisses it), `saveTheme`, `saveDisplayName` (toast "Couldn't save that. Try again." on failure).
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.9, 5.11, 5.12, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.10, 6.11, 7.1, 7.2, 7.4, 7.5, 7.7, 8.1, 8.4, 8.5, 8.6, 8.8_

  - [x] 6.3 Update `useSkillPath`, `useActivity` and `PathView.vue` for injected stores
    - `app/composables/useSkillPath.ts`: second argument becomes `store: ProgressStore`.
    - `app/composables/useActivity.ts`: second argument `completionTimes`; Streak and Week read it; `record()` and the Completion_Log are removed outside Demo_Mode; the demo values stay as before.
    - `app/components/path/PathView.vue`: new props `store: ProgressStore | null` and `completionTimes`; `useSkillPath(tree, store ?? createProgressStore(browserStorage, tree, progressKey))`; remove the `activity.record()` call.
    - _Requirements: 6.1, 6.7, 6.8, 12.2, 12.3_

  - [x] 6.4 Rewire `app/pages/path.vue`
    - Demo_Mode branch unchanged. Otherwise wrap in `SessionGate`, show loading while the store is `loading` or `importing`, show the 5.9 message with "Try again" (`reload()`) on `error`. When `ready`: `pickHobby(toHobbyLibrary(paths, getActiveHobbyId()), route.query.hobby)`, none opens `/new`; `hobbies` and `archived` from `cloudEntries`; archive, restore and delete call the Cloud_Store; delete keeps the 5 s Undo toast; pass `store` and `completionTimes` to `PathView`. Remove `useLibraryRevision` use.
    - _Requirements: 5.2, 5.5, 5.6, 5.7, 5.9, 5.11, 5.12, 6.8, 6.9, 6.11, 12.1, 12.2_

  - [x] 6.5 Rewire `app/pages/new.vue` and `app/composables/useHobbyBuilder.ts`
    - `build()` awaits `useAuth().accessToken()`; `null` sets `unauthorized` and sends nothing. Otherwise send `Authorization: Bearer <token>`. Accept a response only with a valid `loadSkillTree(tree)`, a non-empty `model` and a string `pathId`; then `cloud.addGenerated(...)` replaces `addHobby` and the page opens `/path?hobby=<Hobby_Id>` with no localStorage write of the tree.
    - `new.vue`: "Continue a hobby" from `cloudEntries`; inside `SessionGate`; "Log in" link for an anonymous user that opens `AuthDialog` in `login` mode. Remove `useLibraryRevision` use.
    - _Requirements: 3.4, 4.12, 5.8, 9.12, 9.14_

  - [x] 6.6 Rewire `app/pages/index.vue`
    - Inside `SessionGate`; wait for the store to be `ready`, then open the Active_Hobby's path from the cloud library, else `/new`.
    - _Requirements: 4.7_

  - [x] 6.7 Save the theme from `app/pages/settings.vue`
    - After `setTheme`, call `cloud.saveTheme(theme)` when not in Demo_Mode and a Session exists. `theme.client.ts` and the dev page do not save.
    - _Requirements: 7.2, 7.3, 7.5, 7.6_

  - [x] 6.8 Wire the Cloud_Store into `app/pages/profile.vue`
    - Display name field (`maxlength=40`, saved on submit through `cloud.saveDisplayName` using `normalizeDisplayName`), and the "Save your progress" section (`AuthOptions` in `save` mode) shown only for an Anonymous_User with at least one path, whether or not the dismissed flag is set.
    - _Requirements: 7.4, 7.5, 10.4, 10.5, 10.6, 11.2_

  - [x] 6.9 Add the Save_Prompt trigger to `PathView.vue`
    - After a completion, if `shouldShowSavePrompt(isAnonymous, demo, isSavePromptDismissed(), true)` is true, call `useAuthDialog().show('save', 'prompt')` 250 ms after the Unlock_Moment card closes, or 250 ms after the completion when no card shows. Closing the prompt calls `dismissSavePrompt()`; a failed sign-in keeps it open and does not set the flag.
    - _Requirements: 10.1, 10.3, 10.7, 10.8, 10.9, 10.10, 12.6_

  - [x] 6.10 Remove `useLibraryRevision`
    - Delete `app/composables/useLibraryRevision.ts` once `path.vue` and `new.vue` no longer use it. Confirm no import of it is left. Keep `hobby-store.ts` and its tests as they are.
    - _Requirements: 5.1_

- [x] 7. Changelog and final verification
  - [x] 7.1 Add the CHANGELOG.md entries
    - Under `## [Unreleased]` in `CHANGELOG.md`, add one line per change in the right group, written for a user, each ending with `(spec: accounts-cloud-save)`. Do not edit or reorder existing entries. Suggested lines:
      - Added: "Your paths and progress now live in your account, so they follow you to any device (spec: accounts-cloud-save)."
      - Added: "You can start without signing up. Save your progress with Google or an email link whenever you want (spec: accounts-cloud-save)."
      - Added: "A Profile page lets you set a display name, log in, log out and delete your account with all its data (spec: accounts-cloud-save)."
      - Added: "Your theme is saved to your account and applied on every device (spec: accounts-cloud-save)."
      - Changed: "Paths and progress saved in this browser are imported into your account the first time you open Pursio (spec: accounts-cloud-save)."
      - Changed: "Building a new path now needs a session and is limited per user instead of per network address (spec: accounts-cloud-save)."
      - Changed: "Streak and week now count every completion saved in your account (spec: accounts-cloud-save)."
    - _Requirements: 13.7_

  - [x] 7.2 Run the full suite and typecheck
    - Run `yarn test` (single run) and `yarn typecheck`. Fix any failure, including that existing tests from earlier specs still pass. Confirm `tests/unit/conventions.test.ts` passes with the new dependency and the service-role-key location check.
    - _Requirements: 13.6_

## Notes

- Tasks marked with `*` are optional test sub-tasks. Requirement 13 expects them to exist before the feature counts as finished, so skip them only for a quicker MVP.
- Manual checks are not tasks, because they cannot be done by a coding agent. Do them by hand after task 7: the `supabase/README.md` RLS checklist against a real project; anonymous start, Google and email save, login, log out and delete on desktop and mobile widths; `/path?demo=1` with the network tab open (no Supabase request) and with a stored Session (token unchanged after leaving the demo); a legacy import from a browser holding Hobby_Library, Generated_Tree and Completion_Log data; and a failed callback keeping the stored Session on the pinned supabase-js version.
- Before the Google and email flows work end to end, the Supabase project needs the dashboard settings from the Setup_Guide. The built-in mailer sends 2 emails per hour, only to team members.
- The optional update of `.kiro/steering/structure.md` (new `app/middleware/`, `app/components/auth/`, `supabase/`, `app/pages/profile.vue`) is left to the user.
- Each task references requirements for traceability. Property tests cover Properties 1 to 22 of the design; unit tests cover fixed strings and error cases.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "3.2", "3.5", "3.6", "3.8"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "3.3", "3.7"] },
    { "id": 2, "tasks": ["1.4", "2.3", "3.4"] },
    { "id": 3, "tasks": ["3.9", "3.27", "3.28", "3.29", "3.30", "3.31", "3.32", "3.33", "4.1", "4.2", "5.1", "5.5"] },
    { "id": 4, "tasks": ["3.10", "3.13", "3.16", "3.17", "3.20", "3.21", "4.3", "4.4", "5.2"] },
    { "id": 5, "tasks": ["3.11", "3.14", "3.18", "3.22", "4.5", "4.9", "4.12", "5.3", "5.4"] },
    { "id": 6, "tasks": ["3.12", "3.15", "3.19", "3.23", "4.6", "4.10", "4.11", "5.6"] },
    { "id": 7, "tasks": ["3.24", "4.7", "6.1", "6.3"] },
    { "id": 8, "tasks": ["3.25", "4.8", "6.2"] },
    { "id": 9, "tasks": ["3.26", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9"] },
    { "id": 10, "tasks": ["6.10"] },
    { "id": 11, "tasks": ["7.1"] },
    { "id": 12, "tasks": ["7.2"] }
  ]
}
```
