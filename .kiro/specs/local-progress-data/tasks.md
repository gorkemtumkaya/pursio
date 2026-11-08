# Implementation Plan: local-progress-data

## Overview

Pure logic first (tasks 1 and 2, each with its unit tests), then the page wiring (task 3), the Path_View UI (tasks 4 and 5) and the changelog and checks (task 6). No new dependencies; tests cover logic only; `/path?demo=1` keeps its placeholders.

## Tasks

- [x] 1. Completion_Log, Streak and Week logic
  - Create `shared/utils/streak.ts` (`localDayKey`, `streakDays`, `weekDays`, `appendCompletion`) and `app/utils/activity-store.ts` (`parseCompletionLog`, `createActivityStore`)
  - Unit tests in `tests/unit/streak.test.ts` and `tests/unit/activity-store.test.ts`
  - _Requirements: 1.1 to 1.4, 2.1, 2.2_

- [x] 2. Hobby_Library store with legacy migration
  - Create `app/utils/hobby-store.ts`; add `completionPercent` to `shared/utils/progress-engine.ts`
  - Unit tests in `tests/unit/hobby-store.test.ts` and a `completionPercent` case
  - _Requirements: 3.2 to 3.6_

- [x] 3. Wire the Start_Screen and `/path` to the Hobby_Library
  - `index.vue` uses `addHobby` and opens `/path?hobby=<id>`; `path.vue` picks the entry, redirects when empty, builds the hobby entries and passes `demo`, `hobbies` and `activeId`
  - _Requirements: 3.1, 3.6, 3.7_

- [x] 4. Real Streak, "This week" card, sidebar and Hobby_Switcher in the Path_View
  - `useActivity` composable, `PathWeekCard` props, `PathHobbyList`, hobby Bottom_Sheet with focus return, demo placeholders in `app/utils/demo-placeholders.ts`
  - _Requirements: 1.1, 1.2, 1.5, 2.1 to 2.4, 4.1 to 4.6_

- [x] 5. Hide placeholder navigation and Fresh content
  - `PathNavItems` shows only Path; `PathNodeDetail` hides an empty Fresh list; Fresh samples only in Demo_Mode
  - _Requirements: 5.1 to 5.3_

- [x] 6. Changelog and checks
  - Add user-facing entries under `[Unreleased]` (spec: local-progress-data); run `yarn test` and `yarn typecheck`
