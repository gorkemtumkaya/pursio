# Implementation Plan: ai-skill-tree-generation

## Overview

The plan follows the 7-task grouping at the end of design.md. Tasks 1 to 3 build the server side bottom-up (pure helpers, then schema, adapters and Generator, then handlers and routes). Task 4 adds the client utilities, tasks 5 and 6 wire them into the Start_Screen, `/path` and the Settings_Page, and task 7 adds the changelog and runs the full checks. All code is TypeScript (strict, no `any`). Server modules import each other with relative paths so vitest can load them without Nuxt; only `server/utils/llm-runtime.ts` and the route files use Nitro globals.

Constraints for every task:
- No new dependencies. Use `$fetch` (ofetch), zod 4.6.7, vitest and fast-check 4.10.2 already in the project.
- Do not edit `server/prompts/skill-tree.md`. It is read as a Nitro server asset and passed on unchanged.
- `/path?demo=1` keeps rendering the Sample_Tree. Existing `skill-path-ui` tests keep passing.
- Tests cover logic only: no Vue component tests and no real provider calls. Property tests go in `tests/property/`, example tests in `tests/unit/`, each property test runs at least 100 times and carries the tag `// Feature: ai-skill-tree-generation, Property <n>: <title>`. Reuse `tests/arbitraries.ts`.
- Open decisions in design.md keep the design's defaults (Anthropic `claude-sonnet-4-5` default, the listed Model_Presets, no Test_Route rate limit, `getRequestIP(event)` without `X-Forwarded-For`, `mascot.set` unchanged).

## Tasks

- [x] 1. Shared LLM types, hobby normalization, Tree_Cache and Rate_Limiter
  - [x] 1.1 Add shared LLM types and constants
    - Create `shared/types/llm.ts` with `Provider`, `ProviderConfig`, `ErrorCode`, `TreeResponse`, `TestResponse`
    - Create `shared/utils/llm.ts` with `PROVIDERS`, `PROVIDER_LABELS`, `MODEL_PRESETS`, `ERROR_CODES`, `KEY_HEADER`, `HOBBY_MAX_LENGTH` (60), `MODEL_MAX_LENGTH` (100), `isProvider`, `isErrorCode`, and `normalizeHobby` (`trim`, collapse `/\s+/g` to one space, `toLowerCase`)
    - _Requirements: 1.3, 1.4, 2.3, 11.1_

  - [x] 1.2 Implement Tree_Cache and Rate_Limiter
    - Create `server/utils/tree-cache.ts` with `cacheKey` (`JSON.stringify([normalizeHobby(hobby), provider, model])`) and `createTreeCache(limit = 200)`, a `Map`-based LRU whose `get` refreshes recency and whose `set` evicts the least recent entry past the limit; entries hold only `{ tree, model }`
    - Create `server/utils/rate-limiter.ts` with `createRateLimiter({ limit, windowMs, now })`: per-IP allowed timestamps, drop timestamps `<= t - windowMs`, allow and record when fewer than `limit` remain, delete IPs whose list becomes empty
    - _Requirements: 2.6, 5.4, 6.3, 6.4, 6.5, 7.1, 7.5, 7.6_

  - [x]* 1.3 Write property tests for normalization and cache keys in `tests/property/llm-normalize.property.test.ts`
    - **Property 1: Normalization is idempotent**
    - **Validates: Requirements 1.3**
    - **Property 2: Normalization ignores case and whitespace layout** (whitespace arbitrary includes spaces, tabs, newlines, NBSP)
    - **Validates: Requirements 1.4**
    - **Property 10: Cache keys are equal exactly when their parts are** (model ids with quotes, commas, brackets)
    - **Validates: Requirements 6.5**

  - [x]* 1.4 Write property tests for Tree_Cache and Rate_Limiter
    - `tests/property/tree-cache.property.test.ts`: **Property 11: The Tree_Cache behaves like a bounded LRU** (compare with a list-based reference LRU, limits 1 to 200)
    - **Validates: Requirements 6.4**
    - `tests/property/rate-limiter.property.test.ts`: **Property 12: The Rate_Limiter matches the sliding-window model** (non-decreasing `(ip, timestamp)` sequences, injected clock)
    - **Validates: Requirements 7.1, 7.6**

- [x] 2. Generation_Schema, Provider_Adapters and Generator
  - [x] 2.1 Implement the Generation_Schema
    - Create `server/utils/generation-schema.ts`: build the tree branch from `z.toJSONSchema(skillTreeSchema)` and post-process it with `toProviderSchema` (drop `$schema`; turn `prefixItems` tuples into `{ type: 'array', items, minItems: n, maxItems: n }` and throw at load if tuple entries differ; set `additionalProperties: false` and `required` to all property keys on every object; keep `pattern` and `minItems`)
    - Export `generationSchema` wrapping `anyOf [tree, { error: enum ['not_a_hobby'] }]` in a required `result` property
    - Export `unwrapGenerationOutput(value: unknown)` returning `{ kind: 'not_a_hobby' }` for wrapped or bare `{ "error": "not_a_hobby" }`, otherwise `{ kind: 'candidate', value }`
    - _Requirements: 3.3, 3.4, 5.1_

  - [x] 2.2 Implement the Provider_Adapters
    - Create `server/utils/providers/types.ts` with `AdapterFailure`, `AdapterResult`, `GenerateOptions`, `ProviderAdapter` (`generateTree`, `testConnection`), `Fetcher`, and `providerFailure` (401/403 in `status`, `statusCode` or `response.status` gives `provider_auth`, everything else `provider_error`; never reads error bodies or messages)
    - Create `server/utils/providers/anthropic.ts` (`createAnthropicAdapter(fetcher)`): Messages API with `system` prompt, forced `submit_skill_tree` tool using `generationSchema`, `max_tokens: 8192`, optional retry note as a second text block; return `tool_use.input`; missing tool block or `stop_reason: 'max_tokens'` gives `bad_output`; `testConnection` with `max_tokens: 16`
    - Create `server/utils/providers/openai.ts` (`createOpenAIAdapter(fetcher)`): Chat Completions with `response_format.json_schema` (`strict: true`, `generationSchema`), optional retry note as a second user message; `JSON.parse` the content; refusal, `finish_reason: 'length'`, missing content or parse error gives `bad_output`; `testConnection` with `max_completion_tokens: 16`
    - Every call passes `retry: 0` and the abort signal; responses are narrowed from `unknown` with type guards
    - _Requirements: 2.6, 3.1, 3.3, 3.5, 3.6, 12.3_

  - [x] 2.3 Implement the Generator
    - Create `server/utils/generator.ts` with `generateSkillTree(hobby, config, { adapters, systemPrompt, signal })` following the design algorithm: adapter chosen from the lookup map by `config.provider`, at most 2 calls, `bad_output` or a Tree_Loader rejection triggers one retry, `not_a_hobby` returns without retry, `provider_auth`/`provider_error` return at once, an aborted signal returns `timeout`, two failures return `generation_failed`; the returned tree is the Tree_Loader's output with `config.model`
    - Export `retryNote(errors)`: header line plus `- <formatValidationError(e)>` for the first 20 errors, or the schema-mismatch sentence for `null`
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 5.1_

  - [x]* 2.4 Write unit tests for schema, adapters and Generator
    - `tests/unit/generation-schema.test.ts`: object root with required `result`; no `prefixItems` anywhere; `quests` is an array with `minItems: 3`, `maxItems: 3`; every object has `additionalProperties: false` and full `required`; tree branch keys equal `skillTreeSchema.shape` keys; `unwrapGenerationOutput` on wrapped and bare signals
    - `tests/unit/providers.test.ts` with a fake `Fetcher`: request bodies and headers for both providers, `retry: 0`, 16-token `testConnection` bodies, `bad_output` cases (missing tool block, `max_tokens`, refusal, `length`, unparseable content)
    - `tests/unit/generator.test.ts`: adapter receives the exact text of `server/prompts/skill-tree.md` (read with `fs`) as `systemPrompt` and the trimmed hobby; adapter selected by `config.provider`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 12.3, 13.2, 13.3_

  - [x]* 2.5 Write property tests for provider failures and the Generator in `tests/property/generator.property.test.ts`
    - **Property 6: Provider failures map by status**
    - **Validates: Requirements 3.5, 3.6**
    - **Property 7: The Generator calls at most twice and returns only loadable trees** (adapter outcome sequences from `arbValidTree`, `arbShapeTree` mutations, wrapped and bare Not_A_Hobby_Signal, `bad_output`, `provider_auth`, `provider_error`)
    - **Validates: Requirements 4.2, 4.4, 4.6, 4.7, 5.1**
    - **Property 8: The retry note lists the first 20 formatted errors**
    - **Validates: Requirements 4.3**

- [x] 3. Route handlers, runtime wiring and server config
  - [x] 3.1 Implement the handlers
    - Create `server/utils/llm-handlers.ts` with `ERROR_STATUS`, `resolveProviderConfig` (non-empty trimmed header gives User_Config with validated `provider` and trimmed 1 to 100 char `model`, else 400 `invalid_input`; no header gives Default_Config and ignores body fields; incomplete or invalid Default_Config gives 503 `no_key`)
    - `handleTreeRequest(input, deps)` in the design's step order: hobby check (400), config resolution, cache lookup (hit returns 200 without counting), `limiter.tryConsume(ip)` for Default_Config only (429), Generator under a 40 s `AbortController` raced against the abort (504 `timeout`), cache store for trees only, status mapping; `log` receives only `{ code, provider, model }`
    - `handleTestRequest(input, deps)`: 400 `{ ok: false, error: 'invalid_input' }` without a header key or with a bad provider/model; otherwise `testConnection` under a 15 s abort, 200 with `{ ok: true }` or `{ ok: false, error }`
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.6, 4.4, 4.5, 5.2, 5.4, 6.1, 6.2, 7.2, 7.3, 8.1, 8.3, 12.3, 12.4, 12.5_

  - [x] 3.2 Wire the runtime, routes and config
    - Create `server/utils/llm-runtime.ts`: memoized `loadSystemPrompt()` reading `useStorage('assets:prompts').getItem('skill-tree.md')` (missing or empty gives 502 `provider_error`, logged as `prompt_missing`), adapters bound to `$fetch`, `createTreeCache(200)`, `createRateLimiter({ limit: 10, windowMs: 3_600_000, now: Date.now })`, Default_Config from `useRuntimeConfig()`
    - Create `server/api/tree.post.ts` and `server/api/llm-test.post.ts` as thin routes: `readBody` (failure gives `null`), `getHeader(event, KEY_HEADER)`, `getRequestIP(event) ?? 'unknown'`, call the handler, `setResponseStatus`, return the body (no `createError`)
    - Update `nuxt.config.ts`: server-only `runtimeConfig.llmProvider`, `llmModel`, `llmApiKey` (nothing under `public`), and `nitro.serverAssets: [{ baseName: 'prompts', dir: './prompts' }]`
    - Update `.env.example` with `NUXT_LLM_PROVIDER=anthropic` and `NUXT_LLM_MODEL=claude-sonnet-4-5` next to the existing `NUXT_LLM_API_KEY`
    - _Requirements: 2.5, 2.7, 3.2, 8.1_

  - [x]* 3.3 Write property tests for the handlers in `tests/property/llm-handlers.property.test.ts`
    - **Property 3: Invalid hobbies never reach a provider**
    - **Validates: Requirements 1.1, 1.2**
    - **Property 4: Provider_Config resolution follows the header**
    - **Validates: Requirements 2.1, 2.2, 2.3**
    - **Property 5: API keys never leave the request**
    - **Validates: Requirements 2.6**
    - **Property 9: Only trees are cached, and a cached tree is served without a provider call**
    - **Validates: Requirements 5.4, 6.1, 6.2, 6.3**
    - **Property 13: Only billable generations are counted**
    - **Validates: Requirements 7.3**

  - [x]* 3.4 Write unit tests for handlers and config
    - `tests/unit/llm-handlers.test.ts`: status for each Error_Code; 503 `no_key` for each incomplete Default_Config; 10 billable requests pass and the 11th gets 429 without an adapter call; a hanging adapter with fake timers gives 504 at 40 s and aborts the signal; a cache hit answers under 100 ms; Test_Route `{ ok: true }`, auth/error results, `timeout` at 15 s, 400 without a key
    - `tests/unit/env-example.test.ts`: `.env.example` lists the three `NUXT_LLM_*` keys and `nuxt.config.ts` has no LLM keys under `runtimeConfig.public`
    - _Requirements: 2.4, 2.5, 2.7, 4.4, 4.5, 5.2, 6.2, 7.2, 8.1, 8.3, 12.3, 12.4, 12.5, 13.2, 13.3_

- [x] 4. Client utilities and progress key
  - [x] 4.1 Implement the client storage and request helpers
    - Create `app/utils/llm-settings.ts`: `LLM_SETTINGS_KEY`, `LlmSettings`, `emptySettings`, `effectiveModel` (`customModel.trim() || preset`), `serializeSettings`, `parseStoredSettings` (zod shape check: valid provider, preset from that provider's list, string fields), `loadSettings` (removes invalid values), `saveSettings`; storage errors are silent; reuse `StorageLike` from `progress-store.ts`
    - Create `app/utils/generated-tree.ts`: `GENERATED_TREE_KEY`, `GENERATED_PROGRESS_KEY`, `serializeGeneratedTree`, `parseStoredGeneratedTree` (JSON, non-empty `model`, `loadSkillTree` on `tree`), `loadGeneratedTree` (removes invalid values), `saveGeneratedTree` (writes the tree, removes `GENERATED_PROGRESS_KEY` only)
    - Create `app/utils/tree-client.ts`: `buildTreeRequest` (key header plus `provider` and effective `model` only when `apiKey.trim()` is non-empty, else body `{ hobby }` and no headers), `errorCodeFrom` (known `error` field or `generation_failed`), `friendlyMessage` with the texts from the design table, including the own-key `provider_auth` variant
    - _Requirements: 5.3, 7.4, 8.5, 8.6, 9.5, 10.1, 10.2, 10.6, 10.8, 11.2, 11.7, 11.8_

  - [x] 4.2 Add an optional progress key
    - Change `app/utils/progress-store.ts` to `createProgressStore(getStorage, tree, key = progressStorageKey(tree.hobby))` and `app/composables/useSkillPath.ts` to `useSkillPath(tree, storageKey?)`, passing the key through; existing callers and tests stay unchanged
    - _Requirements: 10.2, 10.3, 13.4_

  - [x]* 4.3 Write property tests for the client utilities in `tests/property/client-storage.property.test.ts`
    - **Property 14: Unknown error responses fall back to generation_failed**
    - **Validates: Requirements 8.5**
    - **Property 15: Tree requests carry the key only when the user set one**
    - **Validates: Requirements 9.5, 11.2**
    - **Property 16: Generated_Tree storage round trip**
    - **Validates: Requirements 10.8**
    - **Property 17: An unusable Generated_Tree is removed**
    - **Validates: Requirements 10.6**
    - **Property 18: Saving a Generated_Tree resets only its own Progress**
    - **Validates: Requirements 10.1, 10.2**
    - **Property 19: LLM_Settings round trip**
    - **Validates: Requirements 11.8**
    - **Property 20: Unusable LLM_Settings are reset**
    - **Validates: Requirements 11.7**

  - [x]* 4.4 Write unit tests for the client utilities in `tests/unit/client-storage.test.ts`
    - Exact Friendly_Message texts for `not_a_hobby` and `rate_limited`; own-key `provider_auth` mentions Settings; `loadGeneratedTree` with nothing saved returns `null`; throwing storage is silent; `createProgressStore` with a custom key writes under that key
    - _Requirements: 5.3, 7.4, 8.6, 10.2, 13.2_

- [x] 5. Start_Screen
  - [x] 5.1 Build the Start_Screen in `app/pages/index.vue`
    - Heading, form with `<label for="hobby">What do you want to get better at?</label>`, `<input id="hobby" maxlength="60">`, submit button "Build my path", Example_Chips "bouldering", "film photography" and "guitar" (chip fills the input then submits), and a link to `/settings`
    - `generate()`: `loadSettings`, `buildTreeRequest`, enter `generating`, `$fetch('/api/tree', { method: 'POST', body, headers, signal, retry: 0 })` under a 45 s `AbortController`; on success `saveGeneratedTree` and `navigateTo('/path')`; on failure map an abort to `timeout`, else `errorCodeFrom(error.data)`, show `friendlyMessage`, return to `idle` and keep the input
    - While generating, disable input, submit and chips; an always-present `role="status" aria-live="polite"` region shows "Building your skill tree…" or the error message
    - Token utilities only (`bg-surface`, `text-ink`, `text-muted`, `rounded-node`, `font-display`); no hardcoded colors, fonts, radii or shadows
    - _Requirements: 5.3, 7.4, 8.2, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1_

- [x] 6. Path page split and Settings_Page
  - [x] 6.1 Split `/path` into a page and `PathView`
    - Move the body of `app/pages/path.vue` unchanged into `app/components/path/PathView.vue` with props `tree: SkillTree`, `progressKey: string`, `model: string | null`, calling `useSkillPath(props.tree, props.progressKey)`; render `<p class="text-xs text-muted">Generated with {{ model }}</p>` under the canvas when `model` is set
    - Rewrite `app/pages/path.vue`: `demo=1` renders the Sample_Tree during SSR as today with `progressStorageKey(sample.hobby)`; otherwise show `PathStatus state="loading"` until `onMounted` reads `loadGeneratedTree` and picks the Generated_Tree with `GENERATED_PROGRESS_KEY` or falls back to the Sample_Tree; keep today's `PathStatus state="error"` for a Sample_Tree load error; render `<PathView :key="choice.progressKey" ...>`
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 6.2 Build the Settings_Page in `app/pages/settings.vue`
    - Provider radio group (changing it selects `MODEL_PRESETS[provider][0]`), model `<select>` of presets, "Custom model id" input, effective model shown under the fields
    - API key `<input type="password">` with "Show" (toggles type, `aria-pressed`) and "Clear" (empties and saves `apiKey: ''`); the note "Your key is stored only in this browser and sent only to generate your tree."
    - Load settings in `onMounted`, save on every change with a `watch`
    - "Test connection" disabled while `apiKey.trim()` is empty; posts to `/api/llm-test` with the key in `x-llm-api-key` and `{ provider, model }` in the body; shows "OK" or `friendlyMessage(error, { usesOwnKey: true })` in a live region
    - Token utilities only
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 12.1, 12.2, 12.4, 12.5_

- [x] 7. Changelog and final checks
  - [x] 7.1 Add CHANGELOG.md entries
    - Under "## [Unreleased]" → "Added", add user-facing one-line entries ending in "(spec: ai-skill-tree-generation)" for: generating a skill tree from any typed hobby on the start screen, the generated path opening at `/path` and being kept in the browser with a "Generated with <model>" label, and the Settings page for choosing provider, model and own API key with a connection test
    - Do not rewrite existing entries
    - _Requirements: 13.5_

  - [x] 7.2 Run the full test suite and typecheck
    - Run `yarn test` (single run, no watch) and `yarn typecheck`; fix any failures in this feature's code
    - Confirm the existing `skill-path-ui` tests still pass, the conventions test still sees the unchanged dependency set, `/path?demo=1` still uses the Sample_Tree, and `server/prompts/skill-tree.md` has no changes in `git diff`
    - Ensure all tests pass, ask the user if questions arise.
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP. Task 7.2 still runs the whole suite.
- There are 7 top-level tasks, matching the grouping in design.md. Task 7.2 serves as the final checkpoint.
- UI behaviour in tasks 5 and 6 is checked manually with `yarn dev` (all three themes, 320 px and 1024 px), as listed under "Manual checks" in design.md; no Vue component tests are written.
- Every property test maps to one numbered property in design.md and names the requirements it validates.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.2"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1", "4.1"] },
    { "id": 2, "tasks": ["1.4", "2.2", "4.3", "4.4"] },
    { "id": 3, "tasks": ["2.3", "5.1"] },
    { "id": 4, "tasks": ["2.4", "2.5", "3.1", "6.1", "6.2"] },
    { "id": 5, "tasks": ["3.2"] },
    { "id": 6, "tasks": ["3.3", "3.4"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2"] }
  ]
}
```
