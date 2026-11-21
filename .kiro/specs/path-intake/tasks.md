# Implementation Plan: Path intake

## Overview

The plan follows the module layout of [design.md](design.md). The core ships first, in the order the owner set (decisions 35 and 38):

1. Profile types and the Sanitizer.
2. The intake endpoint.
3. The latency check: 20 intake calls against the 2 s target, before any Panel work.
4. The Panel on `/new`.
5. Generation with the profile.
6. Known_Nodes and Head_Start_XP.
7. The ready screen.

After the core: the Refresher_Quest rules (Requirement 10), the remaining tests, the manual pass and the change summary.

After task 5 the page already works end to end: the Panel opens and the path builds, while the Tree_Route still ignores the profile. Each later core step adds one visible effect, so the work can stop for review at any checkpoint.

Code is TypeScript (strict, no `any`), with `<script setup lang="ts">` for Vue files. Styling uses theme token utilities only. No new dependency is added: tests use the existing Vitest and fast-check. Commands are `yarn typecheck` and `yarn test`.

Test conventions:
- Property tests go in `tests/property/path-intake-*.property.test.ts`, each with at least 100 runs and the tag comment `// Feature: path-intake, Property N: <title>`.
- Example tests go in `tests/unit/path-intake-*.test.ts`, or extend the existing file of the module they touch.
- Composable and component behavior is tested through pure helpers, because no Nuxt or component test environment exists.
- The property tests of the core rules (Properties 1 to 9 and 11) are written with their module. The wider example tests wait for task 12.

Do not commit. Staging `CHANGELOG.md` triggers an automatic release.

## Tasks

- [x] 1. Profile types and the Sanitizer
  - [x] 1.1 Add the shared types and the outfit list
    - Create `shared/types/learner-profile.ts`: `IntakeLevel`, `Option`, `GoalOption`, `IntakeProfile`, `FinalProfile`, `StoredProfile`
    - Create `shared/utils/mascot-sets.ts` with `MASCOT_SETS` and `DEFAULT_MASCOT_SET`; `app/utils/wick.ts` re-exports them as `WICK_OUTFITS` so no caller changes
    - _Requirements: 2.7_
  - [x] 1.2 Implement `shared/utils/learner-profile.ts`
    - The limit constants and `OPTION_ID`
    - `sanitizeIntakeProfile` with the 8 steps of the design, cutting text by code point
    - `parseFinalProfile` and `parseStoredProfile` from one strict zod schema (`goal` null or one of `goalOptions`, unique `known` ids)
    - `isPlainProfile`, `startLevelFor`, `toStoredProfile`
    - _Requirements: 2.7, 2.8, 2.9, 7.2, 7.3, 7.4, 11.3, 11.5_
  - [x] 1.3 Write property test for the Sanitizer
    - Add profile generators to `tests/arbitraries.ts`: a valid `IntakeProfile`, a damaged copy of one, and arbitrary JSON
    - **Property 3: Sanitizer**
    - **Validates: Requirements 2.7, 2.8, 2.9, 3.5, 16.17**

- [x] 2. Intake endpoint
  - [x] 2.1 Extend the structured call of the provider adapters
    - `StructuredOptions` gains `redactContent?: boolean` and `fastMode?: { reasoningEffort?: string }`
    - Anthropic adapter: with `fastMode`, send `thinking: { type: 'disabled' }`
    - OpenAI adapter: with `fastMode.reasoningEffort`, send `reasoning_effort`
    - `callProvider` passes `redactContent` to `captureAiGeneration`, which then leaves out `$ai_input` and `$ai_output_choices`
    - The judge, the query writer and the goal classifier keep their current requests; check with their existing tests
    - _Requirements: 2.5, 2.15_
  - [x] 2.2 Write the intake prompt `server/prompts/intake.md`
    - The rules listed under "Intake prompt" in the design: data not instructions, never guess, 4 goal options with a finish line of at most 60 characters, 4 to 6 known options, taste options only where taste matters, nothing that matches avoid, the request's language, `mascotSet`, `notAHobby`
    - _Requirements: 2.6, 2.10, 2.11, 2.12, 2.13, 2.14_
  - [x] 2.3 Implement `server/utils/intake-handlers.ts`
    - `IntakeDeps`, `IntakeResponse`, `rawIntakeSchema` and its provider schema, `resolveIntakeConfig`, `handleIntakeRequest` with the 9 steps of the design
    - One 5000 ms budget for the token check and the model call
    - The log entry holds code, stage, provider and model only
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9, 2.14, 2.15, 2.16_
  - [x] 2.4 Add the route and its runtime
    - `server/utils/intake-runtime.ts`: the adapters, the prompt loader, a limiter of 30 per hour that is its own instance, `maxTokens` of 1200 (Anthropic) and 2000 (OpenAI)
    - `nuxt.config.ts`: `llmIntakeModelAnthropic`, `llmIntakeModelOpenai`, `llmIntakeReasoningEffortOpenai` with the defaults of the design, and a comment that the Anthropic value must stay a Haiku model
    - Add the three keys to `.env.example` with placeholder values. The owner does this by hand if the env hook blocks the edit
    - `server/api/intake.post.ts`, in the style of `tree.post.ts`
    - _Requirements: 2.3, 2.4, 2.5, 2.16_
  - [x] 2.5 Write the first endpoint tests
    - `tests/unit/path-intake-route.test.ts` with fake deps: a valid answer gives 200 with a sanitized profile; a damaged answer is repaired; fewer than 2 goal options gives 502; an empty Note clears the four learner fields
    - The Anthropic request body carries `thinking: { type: 'disabled' }` and 1200 tokens; the OpenAI one the configured `reasoning_effort` and 2000
    - _Requirements: 2.5, 2.8, 2.9, 16.19_

- [ ] 3. Latency check (owner runs it)
  - [x] 3.1 Write `scripts/check-intake-latency.ts`
    - Written in TypeScript and run with the `jiti` that Nuxt already installs, so it calls the real handler, prompt, schema and Sanitizer instead of a copy. In the style of `scripts/check-youtube-key.mjs`: it reads the provider key and the intake model from the process environment and never prints them
    - It sends 20 intake calls, one at a time, with the real prompt, schema and request settings: 12 English cases (hobby only, short Note, 400 character Note, a food hobby) and 8 in other languages (Turkish, German, Spanish, Japanese)
    - It prints, per call, the time, the output tokens and whether the Sanitizer accepted the answer; then the median, the slowest call and the number of calls over 2 s and over 5 s. It prints no Note and no answer text
    - _Requirements: 2.5, 16.19_
  - [ ] 3.2 Run it and decide
    - Run on 2026-11-21 with `claude-haiku-5-5`: median 3166 ms, slowest 4063 ms, 0 of 20 under 2 s, 0 over 5 s, none cut off, 20 of 20 accepted. FAIL on the 2 s target only. The owner had the Panel built first and decides on the target and the model afterwards (decision 39)
    - The owner runs the script against the Default_Config
    - Pass: at least 18 of 20 calls under 2 s, none over 5 s, no answer cut off at the token limit, and the Sanitizer accepts all 20
    - If it fails: try the other Haiku model through `NUXT_LLM_INTAKE_MODEL_ANTHROPIC`, then shorten the prompt or ask for fewer options, and run again. Do not start task 4 before this passes or the owner accepts the numbers
    - Record the numbers in `changes.md` under Verification
    - _Requirements: 2.5, 16.19_

- [x] 4. Panel
  - [x] 4.1 Add the copy file `app/utils/intake-copy.ts`
    - Every string of Requirement 15.2, the three level labels, the Chip tags and the accessible names
    - _Requirements: 15.1, 15.2_
  - [x] 4.2 Implement `app/utils/intake-panel.ts`
    - `PanelState`, `openPanel`, `detectedFields`, `selectQuestions`, `removeChip`, `toggleGoal`, `toggleOption`, `finalProfile`, `shownProps`, `answeredProps`, `focusAfterRemoval`
    - _Requirements: 4.2, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 14.2, 14.4_
  - [x] 4.3 Write property test for question selection
    - Add a `PanelState` generator to `tests/arbitraries.ts`
    - **Property 1: Question selection**
    - **Validates: Requirements 5.1, 16.1**
  - [x] 4.4 Write property test for Chip removal
    - **Property 2: Chip removal**
    - **Validates: Requirements 4.5, 5.5, 16.2**
  - [x] 4.5 Write property test for the Final_Profile
    - **Property 9: Final profile**
    - **Validates: Requirements 6.1, 6.2, 7.2, 14.4, 16.9**
  - [x] 4.6 Implement `app/utils/intake-client.ts` and change the tree request
    - `INTAKE_TIMEOUT_MS`, `buildIntakeRequest` (hobby, Note, language, own key and provider), `runIntake` with fetch and timer as arguments; it sanitizes the body and never throws
    - `buildTreeRequest(hobby, profile, settings, goal)` in `app/utils/tree-client.ts`: the profile when there is one, else `level: 'new'`
    - Update `tests/unit/tree-client.test.ts` for the new signature
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 6.5, 6.6_
  - [x] 4.7 Add the analytics events
    - `AnalyticsEvent` gains the five intake events; `AnalyticsProps` allows a `readonly string[]` value
    - _Requirements: 14.1_
  - [x] 4.8 Extend `useHobbyBuilder`
    - States `reading` and `panel`; refs `note` and `panel`; `level` removed
    - `start`, `removeChip`, `toggleGoal`, `toggleKnown`, `toggleTaste`, `buildFromPanel`, `skip`, `retry`, and `generate(profile)` from today's `build`
    - `lastBuild` for the retry rules; the watcher that closes the Panel on a hobby or Note edit; abort of intake on dispose
    - Wick's outfit: the profile's `mascotSet` from the Panel until ready, then the tree's
    - `skill_path_generated` sends `start_level` from `startLevelFor`
    - The five `track` calls
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7, 4.1, 4.9, 6.3, 6.4, 13.1, 13.2, 13.3, 14.2, 14.3, 14.4, 14.5, 14.6, 14.9_
  - [x] 4.9 Add the components
    - `HobbyNoteField.vue`: label with "optional", placeholder, `maxlength`, the counter at 40 or fewer left, `readonly`
    - `HobbyIntakeChip.vue`: tag, value, 44 px × button with its accessible name. Check the "Not for you" tag color for 4.5:1 on the chip surface in all three themes; add a token to every theme first if none passes
    - `HobbyIntakeQuestion.vue`: labelled group, hint, toggle buttons with `aria-pressed`
    - `HobbyIntakePanel.vue`: heading and Chips, the questions of `selectQuestions`, the primary button and the text button, `focusStart()`, focus after a removal, no animation under reduced motion
    - Delete `HobbyLevelPicker.vue`
    - _Requirements: 1.1, 1.2, 1.3, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8, 5.2, 5.3, 5.4, 5.6, 15.4, 15.5, 15.6_
  - [x] 4.10 Wire `app/pages/new.vue`
    - The Note under the hobby field; the Panel under the inputs; the form's button and the idea chips hidden while the Panel is open
    - Wick's lines and the status region texts for reading, Panel, building, ready and error
    - The error form calls `retry`
    - The landing handoff fills the hobby and calls `start` once, then removes `hobby` from the URL
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 1.7, 4.1, 4.7, 4.8, 15.3, 15.5_

- [ ] 5. Checkpoint - Panel works, paths still build
  - Run `yarn typecheck` and `yarn test`
  - By hand: build with a Note and see the Panel; block `/api/intake` and see the path build at once; open `/new?hobby=chess` and see the Panel
  - Ask the user if questions arise

- [x] 6. Generation with the profile
  - [x] 6.1 Extend the Skill_Tree schema and loader
    - `knownOptionId?: string | null` on `SkillNode` and in `skill-tree-schema.ts`; check that the provider schema asks for it on every Node
    - `loadSkillTree` option `requireFinalMilestone`, the `final_milestone` error kind, its line in `formatValidationError` and its label in `rejectionDetail`
    - Extend `tests/unit/skill-tree-schema.test.ts` and `skill-tree-load.test.ts`: a tree without the key loads as before
    - _Requirements: 8.3, 8.9, 8.10_
  - [x] 6.2 Implement `shared/utils/known-nodes.ts`
    - `HEAD_START_XP_PER_SKILL`, `knownNodeIds`, `alignKnownNodes`, `applyProfileToTree`
    - _Requirements: 8.3, 8.8, 9.1, 11.3_
  - [x] 6.3 Write property test for the Final_Milestone
    - Extend the tree generator in `tests/arbitraries.ts` with random `knownOptionId` values and a flag for the last Node
    - **Property 4: Final milestone**
    - **Validates: Requirements 8.3, 8.4, 8.9, 16.4**
  - [x] 6.4 Write property test for the known skill repair
    - **Property 5: Known skill repair**
    - **Validates: Requirements 8.7, 8.8, 9.1, 11.3, 16.5**
  - [x] 6.5 Pass the profile to the generator
    - `GenerateOptions.profile`; `userMessage(hobby, level, profile)` adds the profile block only for a profile that is not plain; both adapters use it
    - `generateSkillTree` passes the profile and `requireFinalMilestone`
    - `server/prompts/skill-tree.md`: the section "Learner profile" of the design
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_
  - [x] 6.6 Store the profile
    - Migration `supabase/migrations/20261121000000_path_profile.sql`: the column with its check, the 8-argument `save_generated_path` with `p_profile jsonb default null`, grants, and a rollback block. Add it to the list in `supabase/README.md`
    - `PathSaveInput.profile`, `PathSaveArgs.p_profile`, `buildSaveArgs`
    - _Requirements: 11.1, 11.2, 11.7_
  - [x] 6.7 Change `handleTreeRequest`
    - `parseFinalProfile` and the 400; the Start_Level from the profile
    - The cache read and write only for a Plain_Profile
    - `applyProfileToTree` on a generated tree; the Stored_Profile for a cache hit
    - The save with the profile; `profile` in the response and in `TreeResponse`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.8, 11.2, 11.4_
  - [x] 6.8 Write property test for the cache gate, and update the route tests
    - **Property 8: Cache gate**
    - **Validates: Requirements 7.3, 7.4, 7.5, 16.10**
    - Update `tests/unit/tree-route.test.ts` and `tests/property/tree-route.property.test.ts` for the `profile` field of the response
    - _Requirements: 16.15_

- [x] 7. Known_Nodes and Head_Start_XP
  - [x] 7.1 Use Effective_Completed everywhere
    - `effectiveCompleted` in `shared/utils/progress-engine.ts`, used by `isAvailable`, `findCurrentNodeId`, `openNodes`, `deriveNodeStates`, `markComplete`, `activeSectionIndex` and `completionPercent`
    - The readers with their own set: `app/utils/section-headers.ts`, `app/utils/profile-stats.ts` (skills done), `app/utils/fresh-request.ts`
    - _Requirements: 9.2, 9.6, 10.1, 12.4_
  - [x] 7.2 Change the XP functions in `shared/utils/xp.ts`
    - `headStartXp`; `skillXpFor` and `questXpFor` skip Known_Nodes; `xpFor` adds the head start
    - _Requirements: 9.3, 9.4, 9.8, 10.3_
  - [x] 7.3 Write property test for Head_Start_XP
    - **Property 6: Head start XP**
    - **Validates: Requirements 9.3, 9.4, 9.5, 9.7, 9.8, 10.3, 16.3**
  - [x] 7.4 Write property test for effective completion
    - **Property 7: Effective completion**
    - **Validates: Requirements 9.2, 9.7, 10.1, 10.4, 12.4, 16.11**
  - [x] 7.5 Carry the profile with every stored path
    - The profile sits on `HobbyRecord`, which `CloudPath.record` already is, so one field serves both stores. It is written only when a path has one, so records without a profile keep today's shape
    - Cloud: `GeneratedPath.profile` and `upsertGenerated`; the path select in `cloud-api.ts`; `pathRowSchema` with `parseStoredProfile` and `alignKnownNodes` in `readPathRow`; `PathInsertRow.profile` for Undo
    - Local: `HobbyRecord.profile`, `parseEntry` with `parseStoredProfile` and `alignKnownNodes`, `serializeHobbyLibrary`; the legacy import copies the profile
    - Server: the Fresh path read in `server/utils/supabase-server.ts` selects `profile` and aligns the tree before it computes the current skill and the completed count
    - `useHobbyBuilder` passes the response's profile to `cloud.addGenerated`
    - Update the fixtures of `cloud-rows.test.ts`, `cloud-library.test.ts`, `hobby-store.test.ts` and `legacy-import.test.ts`
    - _Requirements: 9.2, 9.5, 11.5, 11.6, 11.8_
  - [x] 7.6 Write property test for reading a saved path back
    - **Property 11: Saved paths read back the same**
    - **Validates: Requirements 9.1, 9.5, 11.5, 11.8, 16.18**

- [x] 8. Ready screen
  - [x] 8.1 Extend `app/utils/tree-summary.ts`
    - `summarizeTree(tree, profile)`: `finishLine`, `headStartXp`, `knownLabels`, and `firstSkill` from the Current_Node
    - Add `tests/unit/tree-summary.test.ts`: goal only, known skills only, both, neither, and a Known_Skill without a Node
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  - [x] 8.2 Extend `HobbyReadyCard.vue`
    - The finish line block with the flag icon; the head start block with the XP badge, the checked labels and the refresher line; nothing new when both are empty
    - `useHobbyBuilder` builds the summary from the response's tree and profile
    - _Requirements: 12.1, 12.2, 12.3_

- [ ] 9. Checkpoint - core complete
  - Run `yarn typecheck` and `yarn test`
  - Apply the migration to the local database
  - By hand, rows A1, A2, A8, B10, E1, E3, F5, F10, G1, G6, H1 and I1 of the manual test matrix
  - Ask the user if questions arise

- [x] 10. Refresher_Quest rules
  - [x] 10.1 No Tick_Time for a Refresher_Quest
    - `stampQuestTicks` in `app/utils/cloud-library.ts` gains `skip: ReadonlySet<string>`; `applyProgressChange` in `app/utils/quest-rules.ts` passes the Known_Node ids
    - The quest count in `app/utils/profile-stats.ts` skips Known_Nodes
    - _Requirements: 9.6, 10.2, 10.4_
  - [x] 10.2 Show a Known_Node in the detail view
    - `PathNodeDetail.vue` shows the refresher line when the node carries a `knownOptionId` (trees are aligned at read, so no new prop is needed); the node is `completed`, so "Mark complete" is already not offered
    - _Requirements: 10.1, 10.2_
  - [x] 10.3 Write the Refresher_Quest tests
    - Extend `quest-rules.test.ts`, `daily-pick.test.ts`, `cloud-library.test.ts` and `profile-stats.test.ts`: a refresher tick is saved, gives 0 XP, gets no Tick_Time, grants no Daily_Bonus, is in no Daily_Pick and makes no day active; a reset clears it and keeps the Known_Nodes
    - _Requirements: 9.7, 10.2, 10.3, 10.4, 16.11_

- [ ] 11. Checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`, and ask the user if questions arise.

- [ ] 12. Remaining tests
  - [x] 12.1 Complete the endpoint tests
    - In `path-intake-route.test.ts`: 401, 400, 429, 503, 504, 502 and 422 with their model call counts; the own key path; the 31st call refused; the Tree_Route's limiter unchanged after intake calls and after a refused one; no hobby, Note or profile text in the log entry; `redactContent` set on the call
    - `path-intake-sanitizer.test.ts`: each limit of Requirement 16.6 by example
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.14, 2.15, 2.16, 16.6, 16.7_
  - [ ] 12.2 Write the page flow tests
    - `path-intake-client.test.ts`: `runIntake` for a valid body, every failure kind and the abort at 5000 ms with a fake timer; `buildIntakeRequest`
    - `path-intake-panel.test.ts`: scenario rows B2 to B7, C1 to C5, D4 to D8 and D10; `focusAfterRemoval`
    - `path-intake-flow.test.ts`: retry with the same and with a changed hobby
    - _Requirements: 3.4, 3.5, 3.6, 4.6, 13.2, 13.3, 16.8, 16.9_
  - [x] 12.3 Write property test for the analytics payloads
    - **Property 10: Events carry no text**
    - **Validates: Requirements 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 16.13**
  - [x] 12.4 Write the copy test
    - `path-intake-copy.test.ts`: no hyphen, en dash or em dash in any constant of `intake-copy.ts`
    - _Requirements: 15.1, 16.14_
  - [ ] 12.5 Write the storage tests
    - Examples in `cloud-rows.test.ts` and `cloud-library.test.ts`: a malformed `profile` reads as null and keeps the row; Undo puts the profile back; a path made before this spec loads unchanged with the same XP
    - A migration contract test in the style of `path-color-slot-db.test.ts`, run only with the local test database: the column, the 8-argument function, a call with 7 arguments, and the replace on conflict
    - _Requirements: 11.1, 11.2, 11.5, 11.6, 11.7, 16.12_
  - [ ] 12.6 Update the remaining existing tests
    - Remove or change tests of the level picker and of a `level` argument; keep the suites of `new-hobby-page`, `ai-skill-tree-generation`, `skill-path-ui`, `quests-page` and `reset-progress` green
    - _Requirements: 16.15_

- [ ] 13. Manual pass
  - [ ] 13.1 Run the manual test matrix of design.md
    - Every row, on desktop and phone width; the Panel and the ready card in all three themes; keyboard only and with a screen reader for rows B1, C6 and D9
    - Compare the Panel and the ready card with the four mockups in `dev_docs/new-path-generator-designs/`
    - A 60 character finish line on the node label, the bottom sheet and the side panel
    - Read at least 5 generated paths with avoid and taste entries, rows F7 and F8 (AS4)
    - Put the checklist and its results in `changes.md`
    - _Requirements: 15.4, 15.5, 15.6, 16.16_

- [ ] 14. Change summary and changelog
  - [ ] 14.1 Write `.kiro/specs/path-intake/changes.md`
    - Groups by purpose, each file with its reason, the review order, what was not changed on purpose, what was run and what was not, the latency numbers of task 3.2 and the manual checks of task 13.1
    - Write it while doing the work, and finish it here
  - [ ] 14.2 Add the `CHANGELOG.md` entries under "## [Unreleased]"
    - Added: one line for the Note and the Panel, one for the finish line, one for the head start; Changed: the level picker is gone. Each written for a user, with "(spec: path-intake)"
    - Do not stage the file

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`, and ask the user if questions arise.

## Notes

- Every design property (1 to 11) has its own property test sub-task. Property tests use fast-check with at least 100 runs.
- Task 3 is a gate. It needs a real provider key, so the owner runs it. Nothing in tasks 1 and 2 depends on its result, and tasks 4 and later wait for it.
- The migration of 6.6 can be applied before the deploy: the current server calls the save function with 7 arguments, which still resolves.
- `soft-delete-paths` also changes `paths` and delete. If it lands first, rebase 6.6 and the Undo part of 7.5 on it.
- The migration contract test of 12.5 is skipped without a local test database. No test uses the production database or the network.
- Real env files are never read. The three new keys go into `.env.example` only.
- Avoid and taste are prompt rules (AS4). They are checked by hand in 13.1, not by a test.
- Requirement 10 is task 10 on purpose. Until it is done, a refresher tick already gives 0 XP (task 7.2) and is never a daily pick (task 7.1), but it still gets a Tick_Time, so it can count as an active day.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "4.1", "4.7"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.3"] },
    { "id": 3, "tasks": ["2.4"] },
    { "id": 4, "tasks": ["2.5", "3.1"] },
    { "id": 5, "tasks": ["3.2"] },
    { "id": 6, "tasks": ["4.2", "4.6"] },
    { "id": 7, "tasks": ["4.3", "4.4", "4.5", "4.8", "4.9"] },
    { "id": 8, "tasks": ["4.10"] },
    { "id": 9, "tasks": ["6.1", "6.6"] },
    { "id": 10, "tasks": ["6.2", "6.5"] },
    { "id": 11, "tasks": ["6.3", "6.4", "6.7"] },
    { "id": 12, "tasks": ["6.8", "7.1", "7.2"] },
    { "id": 13, "tasks": ["7.3", "7.4", "7.5"] },
    { "id": 14, "tasks": ["7.6", "8.1"] },
    { "id": 15, "tasks": ["8.2"] },
    { "id": 16, "tasks": ["10.1", "10.2"] },
    { "id": 17, "tasks": ["10.3", "12.1", "12.2", "12.3", "12.4", "12.5", "12.6"] },
    { "id": 18, "tasks": ["13.1"] },
    { "id": 19, "tasks": ["14.1", "14.2"] }
  ]
}
```
