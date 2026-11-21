# Changes: Path intake

Implementation of the `path-intake` spec ([requirements](requirements.md), [design](design.md), [tasks](tasks.md)). This file grows with the work. So far it covers tasks 1 to 4, 6 to 8, 10, and 12.1 to 12.4. The latency check ran and failed on the 2 s target only; the owner had the Panel built first and decides on the target afterwards (decision 39).

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Size:** 41 files changed (1 deleted), 33 added, in 8 groups

What a learner sees now: on `/new`, a "Tell Wick more" field instead of the level picker; "Build my path" reads the Note and opens the Panel; the path is built with the profile; the ready card shows the finish line and the head start. If intake fails or takes 5 s, the path builds at once as before.

## Review order

1. G1. Profile types and the Sanitizer: every other group uses these shapes and limits.
2. G2. Known_Nodes and the tree repair: the core rule of the head start, used by the Tree_Route and every reader.
3. G3. Tree_Route with a profile: the server side of generation.
4. G4. Intake endpoint: new route, independent of G3.
5. G5. Progress, XP and Refresher_Quests: how a Known_Node behaves on the path.
6. G6. The profile in every store: cloud, local, Undo, legacy import, Fresh.
7. G7. Ready card and copy.
8. G8. The Panel on `/new`: the page that ties the rest together.

## Groups

### G1. Profile types and the Sanitizer (tasks 1, 12.1; Req 2.7 to 2.9, 7.2 to 7.4, 11.3, 11.5)

The shapes of the Learner_Profile, its limits, and the function that repairs a model answer into a valid Intake_Profile.

| File | Why it changed |
|---|---|
| [shared/types/learner-profile.ts](../../../shared/types/learner-profile.ts) | New. `IntakeLevel`, `Option`, `GoalOption`, `IntakeProfile`, `FinalProfile`, `StoredProfile`, `IntakeResponse` |
| [shared/utils/mascot-sets.ts](../../../shared/utils/mascot-sets.ts) | New. The outfit list moved here so the shared Sanitizer can check `mascotSet` without importing from `app/` |
| [app/utils/wick.ts:24](../../../app/utils/wick.ts#L24) | `WICK_OUTFITS` is now the shared list, so the two can never differ |
| [shared/utils/learner-profile.ts](../../../shared/utils/learner-profile.ts) | New. Limits, `sanitizeIntakeProfile`, the strict schemas, `parseFinalProfile`, `parseStoredProfile`, `isPlainProfile`, `startLevelFor`, `toStoredProfile` |
| [tests/arbitraries.ts](../../../tests/arbitraries.ts) | Generators: valid and damaged profiles, Final_Profiles, trees with random `knownOptionId` values |
| [tests/property/path-intake-sanitizer.property.test.ts](../../../tests/property/path-intake-sanitizer.property.test.ts) | New. Property 3 |
| [tests/unit/path-intake-sanitizer.test.ts](../../../tests/unit/path-intake-sanitizer.test.ts) | New. Each limit of Req 16.6 by example |

- **Watch for:**
  - Text limits count code points, not UTF-16 units.
  - `avoid` and `taste` repeats are dropped without regard to case.
  - The strict schemas match `goal` to `goalOptions` by `id` only. A request whose goal has a listed id but another label is accepted as sent.
  - The property test counts valid goal options with its own code, written apart from the Sanitizer, and asserts that the damaged cases include both repaired profiles and failures.

### G2. Known_Nodes and the tree repair (task 6.2; Req 8.3, 8.7 to 8.10, 9.1, 11.3; decisions 30, 31)

A Node with a `knownOptionId` is a Known_Node. The Tree_Route repairs the ids before the save and every reader aligns the tree with its stored profile, so "has a `knownOptionId`" and "is a Known_Node" are the same set everywhere.

| File | Why it changed |
|---|---|
| [shared/utils/known-nodes.ts](../../../shared/utils/known-nodes.ts) | New. `knownNodeIds`, `alignKnownNodes` (keeps an id only when requested, first in document order, on a Main_Node that is not a milestone, at most 6), `applyProfileToTree` (also sets the Final_Milestone title to the Finish_Line) |
| [shared/types/skill-tree.ts](../../../shared/types/skill-tree.ts) | `SkillNode.knownOptionId?: string \| null` |
| [shared/utils/skill-tree-schema.ts](../../../shared/utils/skill-tree-schema.ts) | The schema accepts it; trees without it load as before |
| [shared/types/validation.ts](../../../shared/types/validation.ts), [shared/utils/skill-tree-load.ts](../../../shared/utils/skill-tree-load.ts) | `requireFinalMilestone` and the `final_milestone` error; `finalNode` helper |
| [tests/property/path-intake-tree-repair.property.test.ts](../../../tests/property/path-intake-tree-repair.property.test.ts) | New. Properties 4 and 5 |

- **Watch for:**
  - The provider schema of the tree is built from the zod schema, so every generation now asks for `knownOptionId` on every Node (null for most). The prompt says so. A plain build's user message is unchanged, so cached trees stay valid.
  - `alignKnownNodes` returns the same tree object when nothing changes, so reads of old trees allocate nothing new.

### G3. Tree_Route with a profile (tasks 6.1, 6.5 to 6.8; Req 7, 8; decision 27)

| File | Why it changed |
|---|---|
| [server/utils/llm-handlers.ts](../../../server/utils/llm-handlers.ts) | Parses `profile` (400 on any broken limit), takes the Start_Level from it, reads and writes the cache only for a Plain_Profile, repairs the tree with `applyProfileToTree`, saves and returns the Stored_Profile |
| [server/utils/generator.ts](../../../server/utils/generator.ts) | Passes the profile to the adapter; asks the loader for a final milestone when there is a goal |
| [server/utils/providers/types.ts](../../../server/utils/providers/types.ts), [anthropic.ts](../../../server/utils/providers/anthropic.ts), [openai.ts](../../../server/utils/providers/openai.ts) | `profileBlock` adds the profile to the user message as JSON data, only when it is not plain |
| [server/prompts/skill-tree.md](../../../server/prompts/skill-tree.md) | Section "Learner profile": finish line, avoid, taste, known skills, `knownOptionId` on every node |
| [shared/types/llm.ts](../../../shared/types/llm.ts) | `TreeResponse` gains `profile` |
| [shared/types/cloud.ts](../../../shared/types/cloud.ts), [shared/utils/cloud-path.ts](../../../shared/utils/cloud-path.ts) | `p_profile` in the save arguments |
| [supabase/migrations/20261121000000_path_profile.sql](../../../supabase/migrations/20261121000000_path_profile.sql) | New. `paths.profile` and the 8-argument `save_generated_path` |
| [supabase/README.md](../../../supabase/README.md) | Lists the migration and its rollout order |
| [tests/unit/tree-route.test.ts](../../../tests/unit/tree-route.test.ts), [tests/property/tree-route.property.test.ts](../../../tests/property/tree-route.property.test.ts) | Expected bodies and save inputs gain `profile: null`; nothing else changed |
| [tests/property/path-intake-cache-gate.property.test.ts](../../../tests/property/path-intake-cache-gate.property.test.ts) | New. Property 8, and 400 for broken profiles |

- **Must keep working:** a request without `profile` behaves as before, including its `level` and the cache. The only change in its answer is the extra `profile: null`.
- **Watch for:** a request with a profile ignores `level`. The page will stop sending `level` with a profile in task 4.6.

### G4. Intake endpoint (tasks 2, 3.1, 12.1; Req 2; decisions 23, 29, 32, 37)

| File | Why it changed |
|---|---|
| [server/api/intake.post.ts](../../../server/api/intake.post.ts) | New. Thin route |
| [server/utils/intake-handlers.ts](../../../server/utils/intake-handlers.ts) | New. Token, body, config, limit, one structured call within a 5 s budget, not a hobby, Sanitizer |
| [server/utils/intake-runtime.ts](../../../server/utils/intake-runtime.ts) | New. Its own limiter of 30 per user per hour; token limits 1200 and 2000 |
| [server/prompts/intake.md](../../../server/prompts/intake.md) | New. The intake prompt |
| [server/utils/providers/types.ts](../../../server/utils/providers/types.ts) | `StructuredOptions.redactContent` and `fastMode`; `callProvider` passes `redactContent` on |
| [server/utils/providers/anthropic.ts](../../../server/utils/providers/anthropic.ts) | With `fastMode`, sends `thinking: { type: 'disabled' }` |
| [server/utils/providers/openai.ts](../../../server/utils/providers/openai.ts) | With `fastMode.reasoningEffort`, sends `reasoning_effort` |
| [server/utils/ai-observability.ts](../../../server/utils/ai-observability.ts) | With `redactContent`, no input and no output text in the record |
| [nuxt.config.ts](../../../nuxt.config.ts) | `llmIntakeModelAnthropic` (`claude-haiku-5-5`), `llmIntakeModelOpenai` (`gpt-5-mini`), `llmIntakeReasoningEffortOpenai` (`minimal`) |
| [scripts/check-intake-latency.ts](../../../scripts/check-intake-latency.ts) | New. The latency check of task 3 |
| [tests/unit/path-intake-route.test.ts](../../../tests/unit/path-intake-route.test.ts) | New. Every status, the model call counts, both provider request bodies, the log, the 31st call |

- **Related, not changed:** the goal classifier, the judge and the query writer also use `generateStructured`; they send no `fastMode` and no `redactContent`, so their requests are as before.
- **Watch for:**
  - `.env.example` is not updated: the env hook blocks every `.env*` path, including the example. Add `NUXT_LLM_INTAKE_MODEL_ANTHROPIC`, `NUXT_LLM_INTAKE_MODEL_OPENAI` and `NUXT_LLM_INTAKE_REASONING_EFFORT_OPENAI` by hand. The config defaults work without them.
  - The latency script is TypeScript run with `jiti`, which Nuxt already installs, not the `.mjs` the plan named. It calls the real handler, prompt, schema and Sanitizer, so it cannot drift from them.
  - `claude-haiku-5-5` is the default intake model. The latency check is where to confirm it or switch to `claude-haiku-4-5`.

### G5. Progress, XP and Refresher_Quests (tasks 7.1 to 7.4, 10; Req 9, 10; decisions 17, 21, 25)

| File | Why it changed |
|---|---|
| [shared/utils/progress-engine.ts](../../../shared/utils/progress-engine.ts) | `effectiveCompleted`; every reader inside the engine uses it |
| [shared/utils/xp.ts](../../../shared/utils/xp.ts) | `headStartXp`; skill and quest XP skip Known_Nodes; `xpFor` adds the head start |
| [app/utils/section-headers.ts](../../../app/utils/section-headers.ts), [app/utils/fresh-request.ts](../../../app/utils/fresh-request.ts) | Use `effectiveCompleted` |
| [app/utils/profile-stats.ts](../../../app/utils/profile-stats.ts) | Skills done use `effectiveCompleted`; the quest count skips Refresher_Quests |
| [app/utils/cloud-library.ts](../../../app/utils/cloud-library.ts) | `stampQuestTicks` gains `skip`: no Tick_Time for a Refresher_Quest |
| [app/utils/quest-rules.ts](../../../app/utils/quest-rules.ts) | Passes the Known_Node ids as `skip` |
| [app/components/path/PathNodeDetail.vue](../../../app/components/path/PathNodeDetail.vue) | The refresher line on a Known_Node |
| [tests/property/path-intake-known-nodes.property.test.ts](../../../tests/property/path-intake-known-nodes.property.test.ts) | New. Properties 6 and 7, plus a check that the cases hold Known_Nodes |
| [tests/unit/path-intake-refresher.test.ts](../../../tests/unit/path-intake-refresher.test.ts) | New. Refresher ticks: saved, 0 XP, no Tick_Time, no pick, no bonus, no weekly reward, not counted; reset keeps the head start |

- **Must keep working:** a path without Known_Nodes has the same states, percent and XP as before. Properties 6 and 7 compare against the old rules.
- **Watch for:** the node detail view reads `knownOptionId` from the node instead of a new `known` prop (the design's plan). Trees are aligned at read, so the two are the same.

### G6. The profile in every store (task 7.5; Req 9.5, 11.5, 11.8; AS6; decision 36)

| File | Why it changed |
|---|---|
| [app/utils/hobby-store.ts](../../../app/utils/hobby-store.ts) | `HobbyRecord.profile`; `profileField` and `readTreeWithProfile` helpers; local entries read and write the profile and align the tree |
| [app/utils/cloud-rows.ts](../../../app/utils/cloud-rows.ts) | Path_Rows read `profile` and align the tree; `toPathInsertRow` writes it back for Undo |
| [app/utils/cloud-api.ts](../../../app/utils/cloud-api.ts) | The path select adds `profile` |
| [app/utils/cloud-library.ts](../../../app/utils/cloud-library.ts) | `GeneratedPath.profile`; `upsertGenerated` keeps it |
| [app/utils/legacy-import.ts](../../../app/utils/legacy-import.ts) | The import copies the profile into the Path_Row |
| [app/composables/useHobbyBuilder.ts](../../../app/composables/useHobbyBuilder.ts) | Reads the response's tree and profile together and passes both on |
| [server/utils/supabase-server.ts](../../../server/utils/supabase-server.ts) | The Fresh read selects `profile`, aligns the tree, and counts Known_Nodes as completed |
| [tests/property/path-intake-read-back.property.test.ts](../../../tests/property/path-intake-read-back.property.test.ts) | New. Property 11 |

- **Watch for:**
  - The profile sits on `HobbyRecord`, which `CloudPath.record` already is, instead of a separate `CloudPath.profile` as the design said. One field serves both stores.
  - The `profile` key is written only when a path has one, so records and rows without a profile keep the exact shape of today. That is why no existing fixture changed.
  - The client and server now select `paths.profile`. Apply the migration before deploying, as `supabase/README.md` says.

### G7. Ready card and copy (tasks 4.1, 8, 12.4; Req 12, 15)

| File | Why it changed |
|---|---|
| [app/utils/tree-summary.ts](../../../app/utils/tree-summary.ts) | `finishLine`, `headStartXp`, `knownLabels`; "First up" is the Current_Node, so never a Known_Node |
| [app/components/hobby/HobbyReadyCard.vue](../../../app/components/hobby/HobbyReadyCard.vue) | The finish line block and the head start block |
| [app/utils/intake-copy.ts](../../../app/utils/intake-copy.ts) | New. Every fixed string of Req 15.2 |
| [app/utils/icons.ts](../../../app/utils/icons.ts), [tests/unit/icons.test.ts](../../../tests/unit/icons.test.ts) | A `flag` icon in the existing stroke style |
| [tests/unit/tree-summary.test.ts](../../../tests/unit/tree-summary.test.ts) | New. Goal only, known only, both, neither, a known skill without a Node |
| [tests/unit/path-intake-copy.test.ts](../../../tests/unit/path-intake-copy.test.ts) | New. No dash character in any copy |

- **Watch for:** the head start block uses `bg-surface-2` with a `bg-done` badge. The mockup has a pale green block, and there is no such token yet. Adding one means a new variable in all three themes and a contrast pair; left for the comparison with the mockups in task 13.1.

### G8. The Panel on `/new` (tasks 4, 12.2, 12.3; Req 1, 3 to 6, 13, 14; decisions 15 to 19, 26)

| File | Why it changed |
|---|---|
| [app/utils/intake-panel.ts](../../../app/utils/intake-panel.ts) | New. Pure Panel state: Chips, the question rule, Chip removal, single and multi select, the Final_Profile, event payloads, focus after removal |
| [app/utils/intake-client.ts](../../../app/utils/intake-client.ts) | New. The intake request and `runIntake`: 5000 ms abort, sanitizes the body again, every failure is `failure`, never throws |
| [app/utils/tree-client.ts](../../../app/utils/tree-client.ts) | `buildTreeRequest` takes the Final_Profile; without one it sends `level: 'new'` |
| [app/utils/analytics.ts](../../../app/utils/analytics.ts) | The five intake events; a list of strings is allowed as a property value |
| [app/composables/useHobbyBuilder.ts](../../../app/composables/useHobbyBuilder.ts) | States `reading` and `panel`; `start`, Chip and option actions, `buildFromPanel`, `skip`, `retry`, `generate`; the Panel closes when the hobby or Note changes; Wick wears the intake outfit until the tree's |
| [app/pages/new.vue](../../../app/pages/new.vue) | The Note instead of the level picker; the Panel under the inputs; Wick's lines and status texts; focus on open; the handoff runs intake; "Try again" calls `retry` |
| [app/components/hobby/HobbyNoteField.vue](../../../app/components/hobby/HobbyNoteField.vue), [HobbyIntakeChip.vue](../../../app/components/hobby/HobbyIntakeChip.vue), [HobbyIntakeQuestion.vue](../../../app/components/hobby/HobbyIntakeQuestion.vue), [HobbyIntakePanel.vue](../../../app/components/hobby/HobbyIntakePanel.vue) | New components |
| `app/components/hobby/HobbyLevelPicker.vue` | Deleted (decision 15) |
| [tests/property/path-intake-panel.property.test.ts](../../../tests/property/path-intake-panel.property.test.ts) | New. Properties 1, 2 and 9, over random sequences of taps and removals |
| [tests/property/path-intake-events.property.test.ts](../../../tests/property/path-intake-events.property.test.ts) | New. Property 10 |
| [tests/unit/path-intake-panel.test.ts](../../../tests/unit/path-intake-panel.test.ts), [tests/unit/path-intake-client.test.ts](../../../tests/unit/path-intake-client.test.ts) | New. Scenario rows of the Panel; the client's failures, abort and page leave |
| [tests/unit/tree-client.test.ts](../../../tests/unit/tree-client.test.ts) | The level tests became profile tests |

- **Watch for:**
  - "Try again" after changing the hobby now goes back to the input state instead of building at once (Req 13.3), so the next build runs intake.
  - The selected option uses the primary pair and the "Not for you" tag the danger text color; both are tested contrast pairs.
  - The Panel sits outside the `<form>`, so Enter in the hobby field never submits from inside the Panel.
  - The retry rule lives in the composable, which has no test environment, so it is covered by the manual matrix and not by a unit test (part of task 12.2 left open).

## Decisions

1. **Latency** (decision 39): measured median 3.2 s, target 2 s. Open; the owner decides after seeing the Panel.

Two small departures from the design, listed above: the profile on `HobbyRecord`, and no `known` prop on the node detail.

## Not changed on purpose

- `.env.example`: blocked by the env hook (G4).
- The Settings goal and the Goal_Class: decision 20.

## Verification

- **Run:** `yarn test`: 142 files passed, 1 skipped; 1340 tests passed, 16 skipped (the skipped ones need the local test database). Before this batch: 129 files, 1259 tests.
- **Run:** the latency check by the owner, `claude-haiku-5-5`, 20 calls: median 3166 ms, slowest 4063 ms, 0 under 2 s, 0 over 5 s, 0 cut off, 20 accepted.
- **Run:** `yarn typecheck`: no errors.
- **Run:** the latency script without keys: it loads every module and stops with "NUXT_LLM_PROVIDER and NUXT_LLM_API_KEY must be set".
- **Not run:** the migration against a database; anything in the browser. The Panel has not been seen on screen yet.

## Manual checks before release

- Filled in by task 13.1.

## Follow-ups

- The latency decision (decision 39). To measure another model, run the same script again with `NUXT_LLM_INTAKE_MODEL_ANTHROPIC` set.
- Checkpoints 5, 9 and 11, the storage examples of 12.5, the remaining test updates of 12.6, the manual pass of 13 and the changelog of 14.2.
