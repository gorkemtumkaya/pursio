# Implementation Plan: Reset Progress

## Overview

The plan builds the feature from the database up, following the layers in the design: SQL migration, shared types and pure helpers, `SaveQueue` changes, toast duration, cloud API and store, dialog and composable, wiring on the path page, and the Settings entry point. The language is TypeScript (Nuxt 4, Vue 3 `<script setup lang="ts">`, strict, no `any`). The CHANGELOG entry is the last task. Property tests use `fast-check` in `tests/property/`; unit and component tests go in `tests/unit/`.

## Tasks

- [x] 1. Add the database migration
  - [x] 1.1 Create `supabase/migrations/20261109000000_reset_progress.sql`
    - Add `reset_progress(p_scope, p_mode, p_path_id)` and `restore_progress(p_rows, p_reward)` as `security invoker` functions with `set search_path = public`, exactly as written in the design
    - Check `auth.uid()`, validate scope and mode, fail with `path_not_found` for a path that is not the caller's, return `{ rows, reward }`
    - Revoke execute from `public` and `anon`, grant to `authenticated`, and include the rollback comment
    - _Requirements: 2.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.1, 6.1, 8.3, 10.1, 10.2, 10.3, 10.4_

  - [x] 1.2 Update `supabase/README.md`
    - Add the new migration to the migration list
    - Add a "Reset progress" block to the RLS checklist with steps R1 to R10 from the design
    - _Requirements: 10.1, 10.2, 10.4_

- [x] 2. Add shared types and pure reset logic
  - [x] 2.1 Add types to `shared/types/cloud.ts`
    - Add `ResetScope`, `ResetMode`, `ResetSnapshotRow` and `ResetSnapshot`
    - _Requirements: 3.1, 8.3_

  - [x] 2.2 Update `app/utils/cloud-rows.ts`
    - Change `parseProgressRow` to keep `completed_at` and tick times for every node of the tree; `readQuestTicks` drops its `quests` argument and drops only entries that are not in the tree or are all-null
    - Add `parseResetSnapshot(raw): ResetSnapshot | null` with a zod schema (`rows` with `path_id`, nullable `reward`)
    - _Requirements: 3.6, 8.1, 8.3_

  - [x] 2.3 Update `app/utils/cloud-library.ts` and `quest-rules.ts`
    - Change `stampCompletions` to `(prev, before, after, now)` and `stampQuestTicks` to iterate the union of keys of `prev` and `after.quests`, with the retain/drop/stamp rules from the design
    - Pass `path.progress` as the new `before` argument in `applyProgressChange`
    - _Requirements: 3.6_

  - [x] 2.4 Create `app/utils/progress-reset.ts`
    - Add `UNDO_WINDOW_MS`, `ResetPlan`, `resetPlan`, `withProgressReset`, `rewardAfterReset`, `withRestoredProgress` and `resetModeDescription` with the four sentences from the design
    - `withProgressReset` returns untouched paths as the same object and changes only progress fields
    - _Requirements: 1.4, 2.3, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.1, 6.1, 8.3_

  - [x] 2.5 Update existing tests for the relaxed timestamp rules
    - Adjust the `parseProgressRow`, `stampCompletions`, `stampQuestTicks` and `applyProgressChange` tests for the new behavior and the new `before` argument
    - _Requirements: 3.6_

  - [ ]* 2.6 Write unit tests for `progress-reset` and `parseResetSnapshot`
    - Cover the `resetPlan` table, `resetModeDescription` for all four combinations (non-empty, one sentence), and `parseResetSnapshot` with valid and invalid shapes
    - _Requirements: 3.3, 4.1, 4.2, 4.3_

  - [ ]* 2.7 Write property tests for the reset helpers
    - **Property 1: Reset postcondition by mode**
    - **Property 2: Reset touches only the scope and only progress fields**
    - **Property 3: Weekly reward follows scope and mode**
    - **Property 4: Reset is idempotent**
    - **Property 7: Undo restores the previous values**
    - One test per property in `tests/property/reset-progress.property.test.ts`, tagged `Feature: reset-progress, Property N: <text>`, at least 100 runs
    - **Validates: Requirements 1.4, 2.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 5.1, 6.1, 8.3**

  - [ ]* 2.8 Write property tests for kept history
    - **Property 5: Kept history survives a save and reload**
    - **Property 6: Later saves keep retained history**
    - Put them in `tests/property/reset-history.property.test.ts`
    - **Validates: Requirements 3.6**

- [x] 3. Extend `SaveQueue`
  - [x] 3.1 Add `settled()` and `cancel()` to `app/utils/save-queue.ts`
    - `settled()` resolves when nothing is in flight or waiting and never rejects; `cancel()` clears the waiting and failed values without aborting an in-flight write
    - _Requirements: 9.2, 10.1_

  - [ ]* 3.2 Write unit tests for `SaveQueue`
    - `settled()` resolves after the in-flight write and its waiting value; `cancel()` drops the waiting and failed values
    - _Requirements: 9.2_

- [x] 4. Add a toast duration option
  - [x] 4.1 Update `useToast.ts` and `AppToast.vue`
    - Add `durationMs` to `Toast`, accept `options.durationMs` in `show` (default `TOAST_DURATION_MS`), and start `AppToast`'s timer from `toast.durationMs`
    - Existing callers keep 5 seconds
    - _Requirements: 8.2_

  - [ ]* 4.2 Write `AppToast` tests
    - With fake timers, a toast with `durationMs: 8000` stays for 8 s; a default toast hides after 5 s
    - _Requirements: 8.2_

- [x] 5. Add the cloud API methods and store actions
  - [x] 5.1 Add `resetProgress` and `restoreProgress` to `app/utils/cloud-api.ts`
    - Call `supabase.rpc('reset_progress', …)` and `rpc('restore_progress', …)`; throw `CloudError` through the existing `check`
    - _Requirements: 10.1, 10.2_

  - [x] 5.2 Update `app/composables/useCloudStore.ts`
    - Add `resetEpoch` to state (0 in `emptyState` and in the `bootstrap` loading state) and expose it as a computed
    - Add `CLOUD_MESSAGES.resetFailed` and `undoFailed`, `settleQueues`, `cancelQueues` (cancel queues and dismiss their failure toasts), `resetProgress` and `undoReset`
    - Update paths, reward and `resetEpoch` in a single assignment; return `null` for no session, a store that is not `ready`, an unknown path id or an API failure
    - _Requirements: 4.4, 6.2, 8.3, 8.4, 8.5, 9.2, 9.3, 9.4, 10.1, 10.3_

  - [ ]* 5.3 Write property test for failed resets
    - **Property 8: A failed reset changes nothing**
    - Use a mock `CloudApi` whose `resetProgress` rejects
    - **Validates: Requirements 9.2, 9.3, 9.4**

  - [ ]* 5.4 Write unit tests for the store actions
    - Success updates paths, reward and `resetEpoch` together; no session and unknown path id return `null`; `undoReset` failure keeps state and shows the error toast; queues are drained before the call and cancelled only after success; a cancelled queue's Retry toast is gone
    - _Requirements: 4.4, 8.5, 9.2, 10.3_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Build the dialog and composable
  - [x] 7.1 Update `app/components/PathConfirmDialog.vue` (or its existing location under `app/components/`)
    - Add a `role` prop (`'alertdialog' | 'dialog'`, default `'alertdialog'`) and a default slot between the message and the error paragraph
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 7.2 Create `app/components/ResetProgressDialog.vue`
    - Wrap `PathConfirmDialog` with `role="dialog"`, scope-specific title, message (hobby name, "1 path" / "N paths") and confirm label
    - Render the two modes as a radio group in a `fieldset` disabled while `busy`, each with its `resetModeDescription`; emit `confirm`, `cancel` and `update:mode`; use token utilities only
    - _Requirements: 3.1, 3.2, 3.3, 7.1, 7.2, 7.4, 7.5, 9.5, 12.1_

  - [x] 7.3 Create `app/composables/useProgressReset.ts`
    - Provide `open`, `busy`, `error`, `mode`, `target`, `pathCount`, `askReset`, `cancelReset`, `setMode` and `confirmReset`
    - Preselect `keep_history` on open, lock while busy, keep the dialog open with `resetFailed` on failure, close and show an Undo toast with `durationMs: UNDO_WINDOW_MS` on success, run Undo through `cloud.undoReset` and show "Progress restored"
    - _Requirements: 3.2, 7.3, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4, 8.6, 8.7, 9.1, 9.4, 9.5, 9.6_

  - [ ]* 7.4 Write component and composable tests
    - `ResetProgressDialog`: role, labelling, scope texts, radios, disabled while busy, `role="alert"` error, focus on Cancel
    - `useProgressReset` with a mock store: preselected mode, busy lock, failure keeps dialog open without toast, `setMode` clears the error, success shows the 8000 ms Undo toast, second reset replaces the toast, Undo shows the confirmation
    - _Requirements: 3.1, 3.2, 7.1, 7.2, 7.4, 7.5, 8.1, 8.2, 8.4, 8.7, 9.1, 9.4, 9.5, 9.6, 12.1, 12.4_

- [x] 8. Wire the path page
  - [x] 8.1 Add the "Reset this path…" menu item
    - Add a `'reset'` icon to `app/utils/icons.ts`
    - Add `canReset` prop and `reset` emit with a menu item to `PathHobbyOptions.vue`; pass `:can-reset="entry.id === activeId"` and forward `reset` in `PathHobbyList.vue`; forward `reset` in `PathSidebar.vue`
    - _Requirements: 1.1, 1.2, 1.3, 11.1_

  - [x] 8.2 Update `useSkillPath.ts` and `PathView.vue`
    - Add `reload()` to `useSkillPath` and call it on mount
    - Add `resetEpoch` prop and `reset-hobby` emit to `PathView`; on epoch change reload progress, clear the selected node and close the node sheet; wire `@reset` on the sidebar and the mobile hobby list
    - _Requirements: 4.4, 6.3_

  - [x] 8.3 Update `app/pages/path.vue`
    - Use `useProgressReset`, handle `reset-hobby`, pass `:reset-epoch="cloud.resetEpoch.value"` and render `ResetProgressDialog` with `v-if="!isDemo"`
    - After a successful reset, fall back to focusing `#sidebar-hobbies` when the opener is gone
    - _Requirements: 1.2, 6.2, 7.6, 11.1, 11.2, 12.3_

  - [ ]* 8.4 Write tests for the path page wiring
    - `PathHobbyOptions` and `PathHobbyList`: item only when `canReset`, only for the active entry, not for demo entries, keyboard navigation includes it
    - `PathView`: a changed `resetEpoch` reloads progress so the first node is current
    - _Requirements: 1.1, 1.3, 6.3, 11.1_

- [x] 9. Add the Settings entry point
  - [x] 9.1 Update `app/pages/settings.vue`
    - Add a "Reset all progress" row at the top of the Danger zone (inside `v-if="hasSession"`), disabled when `cloud.paths.value.length === 0`
    - Render `ResetProgressDialog` with `scope="all"`, next to `AccountDeleteDialog`
    - _Requirements: 2.1, 2.2, 2.4, 11.2, 12.3_

  - [ ]* 9.2 Write a test for the Settings page
    - The row shows with a session, the button is disabled with zero paths, the row is absent without a session
    - _Requirements: 2.1, 2.4, 11.2_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Update the changelog
  - [x] 11.1 Add the entry to `CHANGELOG.md`
    - Under `## [Unreleased]` → `### Added`, add: "Reset progress from the ⋯ menu of a path or from Settings → Danger zone, either wiping everything or keeping your activity history, with Undo for 8 seconds (spec: reset-progress)."
    - Leave all existing entries unchanged
    - _Requirements: 13.1, 13.2_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Task 2.5 is not optional: the existing tests pin behavior that this feature changes on purpose
- Each task references specific requirements for traceability
- The SQL functions are verified by the manual checklist in `supabase/README.md` (steps R1 to R10), not by automated tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "4.1", "7.1", "8.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3", "3.2", "4.2", "5.1", "8.2"] },
    { "id": 2, "tasks": ["2.4", "2.5"] },
    { "id": 3, "tasks": ["2.6", "2.7", "2.8", "5.2", "7.2"] },
    { "id": 4, "tasks": ["5.3", "5.4", "7.3"] },
    { "id": 5, "tasks": ["7.4", "8.3", "9.1"] },
    { "id": 6, "tasks": ["8.4", "9.2"] },
    { "id": 7, "tasks": ["11.1"] }
  ]
}
```
