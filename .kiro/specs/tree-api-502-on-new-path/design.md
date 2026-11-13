# Tree API 502 On New Path Bugfix Design

## Overview

`POST /api/tree` answers 502 for four different failures (`generation_failed`, `provider_auth`, `provider_error`, `save_failed`). The server log only holds `{ code, provider, model }`, so the failing stage cannot be read from the output. Two stages are also hidden behind a misleading code: a failed system prompt load is reported as `provider_error`, and a missing Supabase config or a failed RPC is reported as `save_failed` with no reason.

The fix is small and targeted:

1. Log the failing stage and a non-secret reason for every error status, including `save_failed`.
2. Keep the generated tree on a save failure so a retry only repeats the save. The server already writes the tree to the cache before saving, so this is mostly locked in with a test. The stage log makes it observable.
3. Show a clearer provider-error message that says the setup needs attention, or that the learner can add their own key in Settings.

The exact cause of the reported 502 is not yet confirmed. The stage log is the tool to confirm it, and the exploratory tests below cover each candidate cause.

## Glossary

- **Bug_Condition (C)**: A `POST /api/tree` request that ends in an error status and either logs no stage/reason, or shows the learner a message that does not say what to do.
- **Property (P)**: Every error status logs its stage and a safe reason, a failed save keeps the tree for a free retry, and provider errors show an actionable message.
- **Preservation**: Status codes, error codes, response shape, rate limiting, caching and the save path through `save_generated_path` stay as they are.
- **handleTreeRequest**: Function in `server/utils/llm-handlers.ts` that runs the whole request (token check, validation, config, cache, generation, save).
- **logLlmError**: Function in `server/utils/llm-runtime.ts` that writes the `[llm]` console line.
- **savePathForUser**: Function in `server/utils/supabase-server.ts` that calls the `save_generated_path` RPC with the learner's token.
- **Stage**: Where in the request the failure happened: `token_check`, `prompt_load`, `provider_call`, `tree_validation`, `path_save`.
- **Reason**: A short, fixed, non-secret label such as `timeout`, `config_missing`, `rpc_error`, `bad_output`. Never a response body, key or token.

## Bug Details

### Bug Condition

The bug shows when the route returns an error status. The handler calls `fail(code)`, and `fail` logs only the code, provider and model. Stages that share a code cannot be told apart: `provider_error` covers both a failed prompt load and a provider failure, `save_failed` covers a missing Supabase config, an RPC error and a save timeout, and `generation_failed` covers a provider answer that failed validation twice. The learner sees one generic sentence for provider errors.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type TreeRequestOutcome  // the handler result plus the log entries it wrote
  OUTPUT: boolean

  RETURN input.status >= 400
         AND ( NOT logHasStageAndReason(input.logEntries)
               OR (input.code IN ['provider_auth', 'provider_error']
                   AND NOT messageTellsNextStep(input.learnerMessage)) )
END FUNCTION
```

### Examples

- Default key is rejected by the provider: response is 502 `provider_auth`; the log shows `{ code: 'provider_auth', provider, model }` and nothing else. Expected: the same plus `stage: 'provider_call'`, `reason: 'auth'`.
- The system prompt asset cannot be read: response is 502 `provider_error`, indistinguishable in the log from a provider outage. Expected: `stage: 'prompt_load'`, `reason: 'prompt_missing'`.
- The `save_generated_path` RPC is missing or errors: response is 502 `save_failed`; the log gives no reason. Expected: `stage: 'path_save'`, `reason: 'rpc_error'` with the Postgres or PostgREST error code when present.
- The save times out after 10 s: expected `stage: 'path_save'`, `reason: 'timeout'`.
- The learner retries after `save_failed`: expected to return the cached tree and run only the save. No second provider call, no extra rate-limit use.
- The provider returns 500: the learner currently reads "The AI service had a problem. Please try again." Expected: a sentence that also points to Settings.
- Edge case: user's own key rejected. Expected: unchanged message "Your API key was not accepted. Check it in Settings."

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- 401 `unauthorized` for a missing or invalid Access_Token (3.1).
- 400 `invalid_input`, 422 `not_a_hobby`, 503 `no_key`, 429 `rate_limited` and 504 `timeout` with the same rules (3.2 to 3.6).
- One retry on an unusable or invalid provider answer, then `generation_failed` (3.7).
- User key handling: provider and model from the body, no hourly-limit use (3.8).
- Saving through `save_generated_path` with the learner's own token and the same `{ tree, model, pathId }` response (3.9).
- HTTP status values in `ERROR_STATUS`, and the `ErrorCode` union, stay as they are.

**Scope:**
Successful requests and all non-502 errors are unaffected apart from one extra log field set on error. This includes:
- 200 responses and their body
- Cache hits and rate-limit counting
- Client behavior for every code other than `provider_auth` and `provider_error`

## Hypothesized Root Cause

The 502 itself is not confirmed. Candidates, from most to least likely:

1. **Default provider setup**: the default key, model or provider is wrong or revoked, so the call returns 401/403 (`provider_auth`) or a model error (`provider_error`).
2. **Save step**: the Supabase config is missing in the dev server, or the `save_generated_path` RPC is not applied to the database, so `savePathForUser` throws `save_failed`.
3. **Prompt asset**: `prompts/skill-tree.md` is not in the server assets, so `loadSystemPrompt` throws and the handler reports `provider_error`.
4. **Model output**: the provider answer fails tree validation twice, giving `generation_failed`.

The visibility defect is certain, whichever one it is: the log cannot separate these cases, and the handler maps the prompt failure to the wrong code. The prompt failure keeps `provider_error` so the public contract does not change; the stage field separates it in the log.

## Correctness Properties

Property 1: Bug Condition - Failing stage is logged and provider errors are actionable

_For any_ `POST /api/tree` request that ends in an error status, the fixed handler SHALL write one log entry holding the code, provider, model, the failing stage and a non-secret reason (and never a key, token or response body), SHALL return the same status and error code as before, and for `provider_auth` and `provider_error` the learner message SHALL tell them to try again later or to add their own key in Settings.

**Validates: Requirements 2.2, 2.4**

Property 2: Bug Condition - Failed save keeps the tree for a retry

_For any_ request where generation succeeded and the path save failed, the fixed handler SHALL return `save_failed` and keep the generated tree in the cache, so that repeating the same request makes no provider call, does not consume the hourly limit again, and attempts only the save.

**Validates: Requirements 2.3**

Property 3: Preservation - Everything else behaves as before

_For any_ input where the bug condition does NOT hold (successful requests, and all errors apart from the new log fields and provider message), the fixed code SHALL produce the same status, body, cache and rate-limit effects as the original code.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct:

**File**: `server/utils/llm-handlers.ts`

**Function**: `handleTreeRequest`, `TreeDeps.log`

**Specific Changes**:
1. **Log entry type**: Replace the log entry with `{ code, provider, model, stage, reason }`. Define `TreeStage = 'token_check' | 'prompt_load' | 'provider_call' | 'tree_validation' | 'path_save'` and keep `reason` as a short fixed string.
2. **Stage-aware `fail`**: Change `fail(code)` to `fail(code, stage, reason)` and pass the stage at each call site.
   - Prompt load catch: `fail('provider_error', 'prompt_load', 'prompt_missing')`.
   - Generation result: map `provider_auth`, `provider_error` and `timeout` to `provider_call`, and `generation_failed` to `tree_validation`.
   - Save: `path_save` with reason `timeout` when `withTimeout` returned the sentinel, else the reason carried by the thrown error.
3. **Token and early errors**: The token check failure (`unauthorized`) logs `token_check` too. It happens before the provider config is resolved, so the entry omits provider and model there (make them optional in the entry type).
4. **Save retry**: Keep `deps.cache.set` before the save. No behavior change is needed, but add a comment and a test that pins this order.

**File**: `server/utils/supabase-server.ts`

**Function**: `savePathForUser`

**Specific Changes**:
1. **Safe reasons**: Throw `Error('save_failed')` with a `reason` of `config_missing` when the Supabase config is absent, and `rpc_error` when the RPC returns an error or a non-string id. When the RPC error has a `code`, include it only if it matches `^[A-Za-z0-9_]{1,16}$`. Never include `error.message`, `details` or `hint`.

**File**: `server/utils/generator.ts` and `server/utils/providers/types.ts`

**Specific Changes**:
1. **Provider reason (optional)**: Where an adapter failure already carries an HTTP status, expose it as a numeric `status` on the failing result so the log can say `http_401` or `http_500`. Adapters must read only the numeric status, as `providerFailure` does today. If the adapters do not expose it without larger changes, log `auth`, `provider` or `bad_output` and stop there.

**File**: `server/utils/llm-runtime.ts`

**Function**: `logLlmError`

**Specific Changes**:
1. **Log line**: Write `console.error('[llm]', { code, stage, reason, provider, model })` with explicit fields only. Do not spread the entry, so an extra field can never leak.

**File**: `app/utils/tree-client.ts`

**Function**: `MESSAGES`, `friendlyMessage`

**Specific Changes**:
1. **Provider messages**: Update the default texts so they say what to do, for example `provider_auth`: "The AI service isn't available right now. Try again later, or add your own API key in Settings." and `provider_error`: "The AI service had a problem. Try again in a moment, or add your own API key in Settings."
2. **Own key**: Keep the existing own-key message for `provider_auth`. Use the new `provider_error` text for both cases, since it is accurate for either.

**Not changed**: `ERROR_STATUS`, `ErrorCode`, `useHobbyBuilder`, the response shape, and the cache key. The builder already keeps the typed hobby on error, and a retry reuses the server cache, so no client state needs to hold the tree.

## Testing Strategy

### Validation Approach

First surface counterexamples on the unfixed code to find which stage fails and to show that the log cannot tell them apart. Then verify the fix and check that nothing else changed. The existing handler tests use injected `TreeDeps`, so every stage can be driven without network, keys or Supabase.

### Exploratory Bug Condition Checking

**Goal**: Show that the log entries on unfixed code lack stage and reason, and confirm which stage produces the reported 502.

**Test Plan**: Drive `handleTreeRequest` with fake deps, capture `deps.log` calls, and assert the entry holds a stage and reason. Run on the UNFIXED code to see the failures. Then run the dev server and read the new log line for the real request.

**Test Cases**:
1. **Provider auth**: adapter returns `provider_auth`; expect `stage: 'provider_call'` (will fail on unfixed code).
2. **Prompt load**: `systemPrompt` rejects; expect `stage: 'prompt_load'` (will fail on unfixed code).
3. **Validation**: adapter returns invalid trees twice; expect `stage: 'tree_validation'` (will fail on unfixed code).
4. **Save failure**: `savePath` throws; expect `stage: 'path_save'` and a reason (will fail on unfixed code).
5. **Save timeout**: `savePath` never resolves; expect `reason: 'timeout'` (will fail on unfixed code).

**Expected Counterexamples**:
- Log entries hold only `code`, `provider` and `model`.
- Possible causes: `fail` takes only a code, and `savePathForUser` throws a bare `save_failed`.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed handler behaves correctly.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := handleTreeRequest_fixed(input)
  ASSERT logHasStageAndReason(result.logEntries)
  ASSERT logIsSecretFree(result.logEntries)
  ASSERT result.status = originalStatus(input) AND result.code = originalCode(input)
  IF input.code IN ['provider_auth', 'provider_error']
    ASSERT messageTellsNextStep(friendlyMessage(result.code))
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed handler matches the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleTreeRequest_original(input) = handleTreeRequest_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing fits because status, body, cache and limiter effects must match across many combinations of token, hobby, level, key source and adapter outcome.

**Test Plan**: Run the existing handler suite on the unfixed code first and keep it green. Then add generated comparisons for the non-error paths.

**Test Cases**:
1. **Success shape**: a working config returns 200 with `{ tree, model, pathId }`.
2. **Early errors**: 401, 400, 422, 503, 429 and 504 return the same status and body.
3. **User key**: requests with a user key use body provider and model and skip the limiter.
4. **Cache hits**: a cached tree skips the provider and the limiter.

### Unit Tests

- Log entry carries stage and reason for each of the five stages.
- Log entry never holds a key, token, prompt or response body (feed sentinel strings through deps and assert they are absent from the logged JSON).
- `savePathForUser` reasons: missing config, RPC error with a safe code, RPC error with an unsafe code (dropped), non-string id.
- `friendlyMessage` for `provider_auth` and `provider_error`, with and without an own key.

### Property-Based Tests

- For any error outcome, the handler returns the status in `ERROR_STATUS` for its code, and logs exactly one entry.
- For any generated tree followed by a save failure, a second identical request makes zero adapter calls and zero limiter consumes, and calls `savePath` once.
- For any non-error input, original and fixed handlers return equal responses.

### Integration Tests

- Hit `POST /api/tree` on the dev server with a bad default key and check the console line shows `provider_call` and no secret.
- Force a save failure, then retry from the new hobby page and confirm only the save runs again.
- Check the error screen shows the new provider text and the typed hobby is kept.
