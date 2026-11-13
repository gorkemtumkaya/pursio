# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Error log lacks failing stage and reason
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the log cannot tell the failing stages apart
  - **Scoped PBT Approach**: Scope the property to the five concrete failing cases below, driven through `handleTreeRequest` with the fake deps in `tests/support/tree-deps.ts`; capture every `deps.log` call
  - Add to `tests/property/tree-route.property.test.ts` (fast-check, vitest)
  - Cases (isBugCondition: status >= 400 and the log entry has no stage/reason):
    - adapter returns `provider_auth` -> expect `stage: 'provider_call'`, `reason: 'auth'`
    - `systemPrompt` rejects -> expect `stage: 'prompt_load'`, `reason: 'prompt_missing'`
    - adapter returns invalid trees twice -> expect `stage: 'tree_validation'`
    - `savePath` throws -> expect `stage: 'path_save'` and a non-empty reason
    - `savePath` never resolves (fake timers) -> expect `stage: 'path_save'`, `reason: 'timeout'`
  - Also assert: status and error code equal the original mapping, exactly one log entry, and the logged JSON holds no sentinel key, token, prompt or response body
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., "log entry is `{ code: 'save_failed', provider, model }` with no stage or reason")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.2, 2.2_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 3: Preservation** - Status, body, cache and limiter effects unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe on UNFIXED code: 200 returns `{ tree, model, pathId }`; 401, 400, 422, 503, 429 and 504 return their current status and error code; cache hit skips the adapter and the limiter; user-key requests use body provider/model and skip the limiter; invalid output is retried once then `generation_failed`; `savePath` receives the learner's own token
  - Write property-based tests in `tests/property/tree-route.property.test.ts` using generated token, hobby, level, key source and adapter outcome; assert the observed status, body, cache writes and limiter calls (do not assert on log fields)
  - Run the existing suite (`yarn test`) on the unfixed code and keep it green
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

- [x] 3. Write save-retry exploration test
  - **Property 2: Bug Condition** - Failed save keeps the tree for a free retry
  - **GOAL**: Pin that a save failure keeps the generated tree cached, so a retry costs no provider call and no limiter use
  - **Scoped PBT Approach**: For any generated valid tree followed by a `savePath` failure, send the same request twice
  - Assert: first response is 502 `save_failed`; second request makes zero adapter calls, zero limiter consumes, and calls `savePath` once more
  - Run on UNFIXED code; the server already caches before saving, so this may PASS. If it passes, note it as an unexpected pass: the behavior is already correct and the test locks it in
  - _Requirements: 1.3, 2.3_

- [x] 4. Fix for tree API 502 visibility and provider message

  - [x] 4.1 Add stage and reason to the handler log
    - In `server/utils/llm-handlers.ts` define `TreeStage = 'token_check' | 'prompt_load' | 'provider_call' | 'tree_validation' | 'path_save'`
    - Replace the log entry with `{ code, stage, reason, provider?, model? }`
    - Change `fail(code)` to `fail(code, stage, reason)` and pass the stage at each call site
    - Prompt load catch: `fail('provider_error', 'prompt_load', 'prompt_missing')` (public code unchanged)
    - Map `provider_auth`, `provider_error`, `timeout` to `provider_call`, and `generation_failed` to `tree_validation`
    - Save failure: `path_save` with `timeout` when `withTimeout` returned the sentinel, else the reason from the thrown error
    - Token check failure logs `token_check` and omits provider and model
    - Keep `deps.cache.set` before the save and add a comment explaining the order
    - _Bug_Condition: isBugCondition(input) where input.status >= 400 and NOT logHasStageAndReason(input.logEntries)_
    - _Expected_Behavior: logHasStageAndReason AND logIsSecretFree AND same status and code_
    - _Preservation: ERROR_STATUS, ErrorCode, response shape, cache key, limiter use unchanged_
    - _Requirements: 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 4.2 Give save failures a safe reason
    - In `server/utils/supabase-server.ts` `savePathForUser`, throw `Error('save_failed')` carrying a `reason`
    - `config_missing` when the Supabase config is absent; `rpc_error` when the RPC returns an error or a non-string id
    - Include the RPC `code` only when it matches `^[A-Za-z0-9_]{1,16}$`; never include `error.message`, `details` or `hint`
    - _Bug_Condition: save_failed logged with no reason_
    - _Expected_Behavior: reason is a fixed non-secret label_
    - _Requirements: 2.2_

  - [x] 4.3 Expose the provider failure status (optional)
    - In `server/utils/generator.ts` and `server/utils/providers/types.ts`, expose a numeric `status` on the failing result only if adapters already carry it, so the log can say `http_401` or `http_500`
    - Read only the numeric status; if this needs larger changes, log `auth`, `provider` or `bad_output` and stop
    - _Requirements: 2.2_

  - [x] 4.4 Write the log line with explicit fields
    - In `server/utils/llm-runtime.ts` `logLlmError`, write `console.error('[llm]', { code, stage, reason, provider, model })`
    - Do not spread the entry, so an extra field cannot leak
    - _Requirements: 2.2_

  - [x] 4.5 Make provider error messages actionable
    - In `app/utils/tree-client.ts` update `MESSAGES` and `friendlyMessage`
    - `provider_auth`: "The AI service isn't available right now. Try again later, or add your own API key in Settings."
    - `provider_error`: "The AI service had a problem. Try again in a moment, or add your own API key in Settings." (used with and without an own key)
    - Keep the existing own-key `provider_auth` message: "Your API key was not accepted. Check it in Settings."
    - Update `tests/unit/tree-client.test.ts` for the new texts
    - _Bug_Condition: input.code IN ['provider_auth', 'provider_error'] AND NOT messageTellsNextStep(message)_
    - _Expected_Behavior: message says try again later or add own key in Settings_
    - _Requirements: 2.4_

  - [x] 4.6 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Failing stage and reason are logged
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.2_

  - [x] 4.7 Verify save-retry test passes
    - **Property 2: Expected Behavior** - Failed save keeps the tree for a free retry
    - **IMPORTANT**: Re-run the SAME test from task 3 - do NOT write a new test
    - **EXPECTED OUTCOME**: Test PASSES
    - _Requirements: 2.3_

  - [x] 4.8 Verify preservation tests still pass
    - **Property 3: Preservation** - Status, body, cache and limiter effects unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 4.9 Add unit tests and run typecheck
    - Unit tests: `savePathForUser` reasons (missing config, RPC error with safe code, unsafe code dropped, non-string id); `friendlyMessage` for both provider codes with and without an own key; log never holds sentinel secrets
    - Run `yarn test` and `yarn typecheck`
    - _Requirements: 2.2, 2.4_

- [x] 5. Add changelog entry
  - Under `## [Unreleased]` in `CHANGELOG.md`, add one user-facing line under Changed: provider errors now tell you to try later or add your own key in Settings (spec: tree-api-502-on-new-path)
  - Add one line under Fixed: failed path builds now record where they failed, so setup problems are easier to find (spec: tree-api-502-on-new-path)
  - Do not rewrite existing entries
  - _Requirements: 2.2, 2.4_

- [x] 6. Checkpoint - Ensure all tests pass
  - Run `yarn test` and `yarn typecheck`
  - With the dev server run manually by the user (`yarn dev`), trigger a new path and read the `[llm]` line to confirm the real failing stage
  - Ensure all tests pass, ask the user if questions arise.
