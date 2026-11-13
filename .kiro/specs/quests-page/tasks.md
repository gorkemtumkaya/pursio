# Implementation Plan: quests-page

## Overview

The plan follows the order of the design: the database migration first, then shared types and pure functions, then the Cloud_Store and composable wiring, then the UI, then tests, then the CHANGELOG. The language is TypeScript (strict, Nuxt 4, Vue 3 `<script setup lang="ts">`, yarn). No new dependency is added by any task except the clearly marked lint item (task 9), which waits for the user's decision.

All quest rules live in pure functions (`daily-pick.ts`, `quest-rules.ts`, `quests-view.ts`) so they are tested without Nuxt. The Cloud_Store, `useNow` and the components are thin wiring.

Existing tests that break with the new shapes (XP formula, `CloudPath`, row parsing, profile stats, import rows, the conventions scan) are updated in task 6 and are required. The unit tests for the daily pick order and the bonus-once rules are required (Requirement 16.1, 16.2). Property tests are optional.

## Tasks

- [x] 1. Database migration and setup guide
  - [x] 1.1 Create the quests migration
    - Add `supabase/migrations/20261108000200_quests.sql` exactly as in the design: `progress.quest_ticks` (jsonb, not null, default `'{}'`), `progress.daily_pick` (jsonb, nullable), `progress.daily_bonus_count` (integer, not null, default 0, check `>= 0`), `profiles.weekly_reward_week` (text, nullable, check on `YYYY-MM-DD` format), `profiles.weekly_reward_count` (integer, not null, default 0, check `>= 0`)
    - Do not change the RLS policy file or `save_generated_path`
    - Add the rollback statements as a comment at the end of the file
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.12_

  - [x] 1.2 Update the Supabase setup guide
    - In `supabase/README.md` add the new file as step 3 in "Apply the migrations"
    - Add two rows to the RLS checklist: as user B, selecting `quest_ticks` of A and updating A's `weekly_reward_count` touch 0 rows; as user A, setting a count to `-1` fails the check constraint
    - Note the rollout order: apply the migration before deploying the new client
    - _Requirements: 13.6, 13.5_

- [x] 2. Shared types and pure functions
  - [x] 2.1 Add the shared types
    - In `shared/types/progress.ts` add `QuestId` (`{ id: string; index: 0 | 1 | 2 }`)
    - In `shared/types/cloud.ts` add `QuestTicks`, `DailyPick`, `QuestData`, `WeeklyReward`; extend `ProgressWriteRow` with `quest_ticks`, `daily_pick`, `daily_bonus_count`; extend `ProfileRow` with `weekly_reward_week`, `weekly_reward_count`; extend `ProfilePatch` with the two weekly fields
    - Keep `Progress` as `{ completed, quests }`
    - _Requirements: 2.1, 13.7, 13.8_

  - [x] 2.2 Extend the XP functions in `shared/utils/xp.ts`
    - Add `XP_PER_QUEST` (10), `XP_PER_DAILY_BONUS` (20), `XP_PER_WEEKLY_REWARD` (50)
    - Split the old `xpFor` body into `skillXpFor`; add `questXpFor` (10 per ticked quest of a Node in the tree) and `weeklyRewardXp(count)`
    - Change `xpFor(tree, progress, dailyBonusCount = 0)` and `xpSummary(tree, progress, dailyBonusCount = 0)` to Hobby_XP = skill XP + quest XP + 20 × count; a negative, fractional or non-finite count counts as 0
    - Keep `XP_PER_NODE`, `xpSummaryOf`, `levelFor` and the thresholds unchanged
    - _Requirements: 3.1, 3.2, 3.3, 3.6_

  - [x] 2.3 Add week and clock helpers to `shared/utils/streak.ts`
    - Move the Monday calculation of `weekDays` into a private `mondayOf`; keep `weekDays` behavior unchanged
    - Add `weekKeyOf`, `weekDayKeys`, `activeDaysInWeek`, `daysLeftInWeek`, `msUntilNextMidnight` (built from date parts so DST days are right) and `questLogWeek` with the `QuestLogDay` and `QuestLogStatus` types
    - _Requirements: 7.2, 7.5, 7.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 5.6_

  - [x] 2.4 Add quest helpers to `shared/utils/progress-engine.ts`
    - Export `findNode`; add `openNodes` (document order, first node wins on a repeated id), `isQuestTicked`, `sameQuest`, `diffTicks` (own entries only, so ids such as `__proto__` behave)
    - Leave `toggleQuest`, `markComplete` and node state rules unchanged
    - _Requirements: 2.1, 4.3, 12.1, 12.2, 12.3, 12.4_

  - [x] 2.5 Create `shared/utils/daily-pick.ts`
    - Export `DAILY_PICK_SIZE`, `candidateQuests` (groups: Current_Node, open side quests, other open nodes; then document order, then index, without sorting), `pickDailyQuests`, `newDailyPick` (returns `null` when there is no candidate), `needsNewPick`, `dailyBonusDue`
    - No Nuxt imports
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 6.1, 6.3, 6.5_

  - [x] 2.6 Extend `app/utils/cloud-library.ts`
    - Add `questTicks`, `dailyPick`, `dailyBonusCount` to `CloudPath`; add `emptyQuestData`, `activityTimes` (completion times plus tick times, archived paths included), `questTickTimes`, `stampQuestTicks`
    - Make `upsertGenerated` give a regenerated path `emptyQuestData()`; keep `withPath` and `withoutPath` unchanged so Undo restores the quest fields
    - _Requirements: 2.2, 2.3, 2.4, 10.1, 10.2, 10.3, 13.9, 13.12_

  - [x] 2.7 Create `app/utils/quest-rules.ts`
    - Export `WEEKLY_TARGET_DAYS`, `ProgressChange`, `applyProgressChange` (stamps completions and tick times, grants the daily bonus, grants the weekly reward in one result; `null` for an unknown path id), `withDailyPick` (`null` when nothing changes; never changes `dailyBonusCount`, `progress` or `questTicks`) and `weeklyRewardDue` (never when `weekly` is `null`)
    - Unticking never lowers `dailyBonusCount` or `weeklyReward.count`
    - _Requirements: 2.2, 2.3, 3.7, 4.1, 4.6, 4.7, 6.1, 6.2, 6.3, 6.4, 6.5, 8.1, 8.2, 8.3, 8.4_

  - [x] 2.8 Extend row parsing in `app/utils/cloud-rows.ts`
    - Add the zod schemas for `quest_ticks`, `daily_pick` and counts, each parsed separately so one bad column never discards another or the Progress
    - `parseProgressRow` returns `{ progress, completedAt, questTicks, dailyPick, dailyBonusCount }`: drop ticks of unticked quests and of Nodes not in the tree, drop pick quests whose Node is missing and repeated Quest_Ids, read a bad column as `{}`, `null` or 0; an unusable Progress gives empty quest fields too
    - `parsePathRow` returns `emptyQuestData()` fields; add `parseWeeklyReward` (returns `null` only when the row is not an object); `toProgressRow` takes the quest data as a required fifth parameter
    - _Requirements: 2.6, 13.7, 13.9, 13.10_

  - [x] 2.9 Create `app/utils/quests-view.ts`
    - Export pure view models: `resetsInLabel` (never `0M`, minimum `1M`), `daysLeftLabel`, `todayView`, `weeklyView`, `logView`, `pathCards`
    - Texts exactly as in the requirements: "RESETS IN 9H", "Finish all 3 for +20 bonus XP" hint state, "Bonus earned: +20 XP", "N of 4 · Reward: +50 XP", "Reward earned: +50 XP", log accessible names such as "Monday, 2 quests"
    - _Requirements: 5.1, 5.2, 5.5, 5.6, 5.7, 7.3, 7.4, 7.5, 7.6, 9.2, 9.3, 9.4, 9.5, 9.6, 9.8, 11.1, 11.2, 11.3, 11.4, 11.6, 15.7_

  - [x] 2.10 Update `app/utils/profile-stats.ts`
    - Change to `profileStats(paths, now, weeklyRewardCount = 0)`: Hobby_XP per path via `xpFor(tree, progress, dailyBonusCount)`; total XP = sum over all paths, archived included, plus `weeklyRewardXp(count)`; each hobby row level from its own Hobby_XP (no weekly reward); streak and the 3-day and 7-day milestones use `activityTimes`
    - _Requirements: 3.4, 3.5, 8.5, 10.1, 10.4_

- [x] 3. Cloud_Store and composable wiring
  - [x] 3.1 Update the API layer, the store interface and the import plan
    - `app/utils/cloud-api.ts`: `listProgress` selects the three new columns, `getProfile` selects the two weekly columns, `updateProfile` takes the wider `ProfilePatch`
    - `app/utils/progress-store.ts`: add the optional `dailyBonusCount?(): number` member; leave `storedProgressSchema` as it is
    - `app/utils/legacy-import.ts`: planned progress rows carry `quest_ticks: {}`, `daily_pick: null`, `daily_bonus_count: 0`
    - _Requirements: 13.7, 13.8, 3.1_

  - [x] 3.2 Wire the quest data into `app/composables/useCloudStore.ts`
    - Add `weeklyReward: WeeklyReward | null` to `CloudProfile`; fill it in `loadProfile` with `parseWeeklyReward`; change `saveTheme` and `saveDisplayName` to spread the current profile so the field is not dropped
    - `progressStore(pathId).save` calls `applyProgressChange`, sets `paths` and `profile.weeklyReward` in one state assignment, queues the path write, and queues the profile write when a weekly reward was granted; add `dailyBonusCount()` to the returned store
    - Generalize `queueFor` into `makeQueue(key, write)` so the path queues and the reward queue share the sticky "Couldn't save your last change." toast with Retry; reset the reward queue in `clear()` and `bootstrap()`
    - Add `ensureDailyPick(pathId, now)` (no-op unless `status === 'ready'`) and the `weeklyReward` computed
    - Make `undoRemove` pass the removed path to `toProgressRow`; `remove` and `archive` never touch `weeklyReward`
    - _Requirements: 2.2, 2.3, 2.5, 4.1, 6.1, 6.2, 8.1, 8.2, 8.7, 13.7, 13.8, 13.9, 13.11_

  - [x] 3.3 Update `useSkillPath` and `useActivity`
    - `app/composables/useSkillPath.ts`: the XP bar uses `store.dailyBonusCount?.() ?? 0` (Demo_Mode gets 0)
    - `app/composables/useActivity.ts`: rename the parameter to `activityTimes`; behavior unchanged
    - _Requirements: 3.1, 3.5, 10.2_

  - [x] 3.4 Update the consumers of activity and totals
    - `app/pages/path.vue` and `app/components/path/PathView.vue`: rename the prop `completionTimes` to `activityTimes`; the page passes `activityTimes(paths)`
    - `app/components/path/PathWeekCard.vue`: change the screen-reader status texts to "practiced" and "no practice"
    - `app/pages/profile.vue`: pass `cloud.weeklyReward.value?.count ?? 0` to `profileStats`
    - _Requirements: 8.5, 10.1, 10.2, 10.4_

  - [x] 3.5 Create `app/composables/useNow.ts`
    - Return a readonly ref of epoch ms that starts at `Date.now()`, updates every 15 s and on tab focus and visibility, starts in `onMounted`, stops in `onBeforeUnmount`
    - _Requirements: 4.8, 5.6, 7.7_

- [x] 4. Checkpoint - Types and wiring compile
  - Run `yarn typecheck` and fix errors in non-test code. Test files are updated in task 6.
  - Ask the user if questions arise.

- [x] 5. UI
  - [x] 5.1 Extend `app/components/path/PathQuestItem.vue`
    - Add optional props `subtitle`, `badge` and `ariaLabel`; without them it renders exactly as today
    - _Requirements: 5.2, 15.6_

  - [x] 5.2 Add the Quests item to `app/components/path/PathNavItems.vue`
    - Insert Quests between Path and Profile with the `target` icon, `aria-current="page"` on `/quests`, hidden in Demo_Mode; `onPath` is false on `/quests`
    - Update the component comment: Fresh stays hidden, Quests is shown
    - _Requirements: 1.2, 1.3, 1.4, 15.4_

  - [x] 5.3 Create the small Quests components
    - `app/components/quests/QuestsRing.vue` (`role="img"` with the ring label), `QuestsHeader.vue` (hobby name on desktop, title "Quests", mobile subtitle), `QuestsEmpty.vue` (Wick `sleep`, "No hobby to practice yet", link "Build a path" to `/new`)
    - Typed props and emits; token utilities only; visible focus outline
    - _Requirements: 1.7, 5.1, 5.8, 15.3, 15.5, 15.7_

  - [x] 5.4 Create the three cards
    - `QuestsTodayCard.vue`: banner with ring, hint and "RESETS IN" line, a list of `PathQuestItem` rows, the "You're all caught up on this path" state
    - `QuestsWeeklyCard.vue`: title "Practice on 4 days this week", 4 segments (`aria-hidden`), text, days left, `sr-only` "N of 4 days"
    - `QuestsLogCard.vue`: seven boxes with the done, missed, today and upcoming styles, `sr-only` names, caption "Number = quests finished that day"
    - Cards hold no logic and take view models as props
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 4.9, 7.1, 7.3, 7.4, 7.5, 7.6, 9.1, 9.7, 9.8, 15.3, 15.6, 15.7_

  - [x] 5.5 Create the path section
    - `QuestsPathCard.vue`: one link to the path of the Active_Hobby; desktop content (label, `PathXpBar`, "Next: …" or the all-done line) in `hidden lg:block`, one-row mobile content (title and "N of 3 quests") in `lg:hidden`, one tab stop per card
    - `QuestsPathSection.vue`: "From your path" heading and the cards; hidden when there are no cards
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 15.4_

  - [x] 5.6 Create `app/components/quests/QuestsView.vue`
    - Props: `path: CloudPath`. Use `useSkillPath(tree, cloud.progressStore(path.pathId))` for `toggleQuest`, read ticked state from `props.path.progress`, use `useNow` and the day key
    - `watch([day, () => path.progress.completed], …, { immediate: true, flush: 'post' })` calls `cloud.ensureDailyPick`
    - Toast watchers on state transitions only ("+20 bonus XP", "+50 XP weekly reward"); skip when the current toast is sticky
    - Grid layout from the design: DOM order title, Today, Weekly, Log, Path (mobile); two columns at `lg` with the `contents` wrapper
    - Offer no Mark_Complete action
    - _Requirements: 2.5, 4.1, 4.2, 4.8, 6.6, 8.6, 12.5, 14.2, 14.4, 15.1, 15.2_

  - [x] 5.7 Create `app/pages/quests.vue`
    - Same frame as `profile.vue`: `useHead({ title: 'Quests · Pursio' })`, `AppShell`, `AuthSessionGate`, `main` container
    - Choose the Active_Hobby with `pickHobby(toHobbyLibrary(cloud.paths.value, getActiveHobbyId()), null)`
    - Show `PathStatus` "Loading your quests…" while `idle`, `loading` or `importing`; `AuthRetryNotice` with `CLOUD_MESSAGES.loadFailed` and `cloud.reload` on `error`; `QuestsEmpty` when no hobby that is not archived; otherwise `QuestsView` with `:key="path.pathId"`
    - _Requirements: 1.1, 1.5, 1.6, 1.7, 4.2, 14.1, 14.3_

- [x] 6. Tests
  - [x] 6.1 Extend `tests/arbitraries.ts`
    - Add `arbQuestData`, `arbDailyPick`, `arbTickTimes`; make `arbCloudPath` produce consistent quest data (ticks only for ticked quests, a pick of up to 3 distinct quests of nodes in the tree, a count of 0 or more)
    - Update `tests/unit/arbitraries.test.ts` if it asserts the old `CloudPath` shape
    - _Requirements: 2.6, 13.10_

  - [x] 6.2 Update `tests/unit/xp.test.ts` and `tests/unit/profile-stats.test.ts`
    - Fix fixtures and expected values that change with the new XP formula and the `profileStats` signature
    - Add examples: 50 per skill, 10 per quest, 20 per bonus, bad counts treated as 0, `weeklyRewardXp`; total XP includes quest XP, bonuses and the weekly reward; hobby level excludes the weekly reward; streak counts tick days
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 8.5, 10.1, 10.4_

  - [x] 6.3 Update `tests/unit/cloud-rows.test.ts`, `tests/unit/cloud-library.test.ts` and `tests/unit/legacy-import.test.ts`
    - Fix fixtures and `toEqual` shapes for `CloudPath`, `parseProgressRow`, `parsePathRow`, `toProgressRow`, `ProfileRow` and the planned import rows (empty quest columns)
    - _Requirements: 13.7, 13.9, 13.10_

  - [x] 6.4 Update `tests/unit/conventions.test.ts`
    - Add `app/components/quests/**` and `app/pages/quests.vue` to `SCANNED` and assert the new files are in the scanned list
    - Do not change the asserted dependency list (that is part of the lint item, task 9)
    - _Requirements: 15.3_

  - [x] 6.5 Update the existing property tests that break
    - `tests/property/xp.property.test.ts` (Property 26 now adds quest XP), `tests/property/cloud-rows.property.test.ts` (the `xpFor` equalities and the Progress_Row round trip), `tests/property/cloud-library.property.test.ts` and `tests/property/legacy-import.property.test.ts`
    - Run `yarn test` and fix any other existing test that fails only because of the new shapes; do not weaken assertions
    - _Requirements: 3.1, 13.7, 13.9_

  - [x] 6.6 Write unit tests for the daily pick order
    - Create `tests/unit/daily-pick.test.ts`
    - Cover: group order (Current_Node, open side quests, other open nodes), order inside a group (document order, then quest index), the limit of 3, fewer than 3 candidates, no candidate gives `null`, ticked quests excluded, locked and completed nodes excluded, same input gives the same output, `needsNewPick` for the same day, another day and `null`
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 16.1_

  - [x] 6.7 Write unit tests for the bonus-once rules
    - Create `tests/unit/quest-rules.test.ts` using `applyProgressChange`, `withDailyPick` and `weeklyRewardDue`; build dates from local parts (`new Date(y, m - 1, d, h)`)
    - Cover: daily bonus granted once per pick; no second bonus after untick and tick; no bonus for a pick of 1 or 2 quests; no bonus for a pick of another day; a new bonus on the next Local_Day; weekly reward granted once per week at the fourth active day; a new reward in the next week; both counts unchanged after unticking; no weekly grant when `weekly` is `null`; `withDailyPick` keeps the bonus count
    - _Requirements: 3.7, 6.1, 6.2, 6.3, 6.4, 6.5, 8.1, 8.2, 8.3, 8.4, 16.2_

  - [ ]* 6.8 Write unit tests for the week helpers
    - Extend `tests/unit/streak.test.ts`: `weekKeyOf`, `weekDayKeys`, `activeDaysInWeek`, `daysLeftInWeek` for all seven weekdays, `msUntilNextMidnight` on a DST-change day, `questLogWeek` statuses
    - _Requirements: 5.6, 7.2, 7.5, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 6.9 Write unit tests for the progress engine additions
    - Extend `tests/unit/progress-engine.test.ts`: `openNodes`, `diffTicks`, `isQuestTicked`; ticking all three quests leaves the Node uncompleted; `markComplete` works with 0 of 3 ticked and keeps the ticks
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ]* 6.10 Write unit tests for the new row and library functions
    - Extend `tests/unit/cloud-rows.test.ts` (each new column with a good value, a wrong shape and `null`; `toProgressRow` includes the three columns; `parseWeeklyReward`) and `tests/unit/cloud-library.test.ts` (`stampQuestTicks`, `activityTimes`, `questTickTimes`, `upsertGenerated` resets quest data, `withPath` Undo keeps it)
    - _Requirements: 2.2, 2.3, 2.6, 10.1, 13.9, 13.10, 13.12_

  - [ ]* 6.11 Write unit tests for the view models
    - Create `tests/unit/quests-view.test.ts`: `resetsInLabel` ("RESETS IN 9H", "RESETS IN 42M", "RESETS IN 1M"), `daysLeftLabel`, ring text, hint states, weekly texts, log box styles and accessible names, path cards including the all-done line and no Current_Node
    - _Requirements: 5.6, 5.7, 7.4, 7.5, 7.6, 9.8, 11.4, 11.6_

  - [ ]* 6.12 Write property test for toggling a quest
    - Create `tests/property/quests-progress.property.test.ts`
    - **Property 1: Toggling a quest changes exactly that quest**
    - **Validates: Requirements 2.1, 5.4**

  - [ ]* 6.13 Write property test for skill completion independence
    - Add to `tests/property/quests-progress.property.test.ts`
    - **Property 2: Skill completion does not depend on quests**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4**

  - [ ]* 6.14 Write property test for tick times
    - Create `tests/property/quests-rules.property.test.ts`
    - **Property 3: Tick times follow ticks**
    - **Validates: Requirements 2.2, 2.3, 2.4**

  - [ ]* 6.15 Write property test for the Hobby_XP formula
    - Create `tests/property/quests-xp.property.test.ts`
    - **Property 4: Hobby_XP formula**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.6**

  - [ ]* 6.16 Write property test for total XP and hobby levels
    - Add to `tests/property/quests-xp.property.test.ts`
    - **Property 5: Total XP and hobby levels**
    - **Validates: Requirements 3.4, 3.5, 8.5**

  - [ ]* 6.17 Write property test for the pick contents
    - Create `tests/property/quests-pick.property.test.ts`
    - **Property 6: A daily pick holds only valid candidates, at most three**
    - **Validates: Requirements 4.3, 4.5**

  - [ ]* 6.18 Write property test for the candidate order
    - Add to `tests/property/quests-pick.property.test.ts`
    - **Property 7: Candidate order**
    - **Validates: Requirements 4.4**

  - [ ]* 6.19 Write property test for pick stability
    - Add to `tests/property/quests-pick.property.test.ts`
    - **Property 8: The pick is stable within a day and replaced on the next**
    - **Validates: Requirements 4.1, 4.6, 4.7, 6.4**

  - [ ]* 6.20 Write property test for the daily bonus
    - Add to `tests/property/quests-rules.property.test.ts`
    - **Property 9: The daily bonus is granted at most once per pick**
    - **Validates: Requirements 6.1, 6.3, 6.5, 3.7**

  - [ ]* 6.21 Write property test for the weekly reward
    - Add to `tests/property/quests-rules.property.test.ts`
    - **Property 10: The weekly reward is granted at most once per week**
    - **Validates: Requirements 8.1, 8.3, 8.4, 3.7**

  - [ ]* 6.22 Write property test for the weekly challenge numbers
    - Create `tests/property/quests-view.property.test.ts`
    - **Property 11: Weekly challenge numbers**
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.6, 7.7, 14.4**

  - [ ]* 6.23 Write property test for week structure and clock labels
    - Add to `tests/property/quests-view.property.test.ts`
    - **Property 12: Week structure and clock labels**
    - **Validates: Requirements 5.6, 7.5, 9.1**

  - [ ]* 6.24 Write property test for the quest log
    - Add to `tests/property/quests-view.property.test.ts`
    - **Property 13: Quest log**
    - **Validates: Requirements 9.2, 9.3, 9.4, 9.5, 9.6, 9.8**

  - [ ]* 6.25 Write property test for active days
    - Create `tests/property/quests-activity.property.test.ts`
    - **Property 14: Active days come from completions and ticks**
    - **Validates: Requirements 10.1, 10.3**

  - [ ]* 6.26 Write property test for the quest data round trip
    - Create `tests/property/quests-rows.property.test.ts`
    - **Property 15: Quest data round trip**
    - **Validates: Requirements 13.7, 13.9**

  - [ ]* 6.27 Write property test for malformed quest columns
    - Add to `tests/property/quests-rows.property.test.ts`
    - **Property 16: Malformed quest columns read as empty**
    - **Validates: Requirements 2.6, 13.10**

  - [ ]* 6.28 Write property test for Today's card
    - Create `tests/property/quests-cards.property.test.ts`
    - **Property 17: Today's card**
    - **Validates: Requirements 5.1, 5.5, 5.7, 15.7**

  - [ ]* 6.29 Write property test for path cards
    - Add to `tests/property/quests-cards.property.test.ts`
    - **Property 18: Path cards**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.6**

- [x] 7. Checkpoint - Tests and typecheck pass
  - Run `yarn typecheck` and `yarn test` (single run, no watch mode). Ensure all tests pass, ask the user if questions arise.

- [x] 8. Changelog
  - [x] 8.1 Add the `[Unreleased]` entries to `CHANGELOG.md`
    - `CHANGELOG.md` has no `## [Unreleased]` heading yet: add it above `## [Released]` and do not rewrite existing entries
    - Added: a Quests page with three small quests a day from your path, a +20 XP bonus for finishing them, a weekly goal of practicing on 4 days, and a log of your week
    - Changed: every quest you tick now gives +10 XP, so levels rise faster than before
    - Changed: your streak and "This week" card now also count days on which you ticked a quest
    - Changed: the main menu now shows Quests between Path and Profile
    - Each line ends with `(spec: quests-page)`
    - _Requirements: 16.6_

- [x] 9. OPEN ITEM, BLOCKED ON USER DECISION: `yarn lint`
  - [x] 9.1 Resolve the `yarn lint` criterion (Requirement 16.3)
    - **Do not start this task until the user has chosen an option. If no decision is recorded, skip it and report it as open. Do not add any dependency without that approval.**
    - Context: `package.json` has no `lint` script and no linter configuration. A linter is a new dependency, which the project rules say needs approval and an exact pinned version.
    - Option A, user approves a linter (for example ESLint with `typescript-eslint` and `eslint-plugin-vue`, or `@nuxt/eslint`): add the dependencies at exact versions, the `lint` script and a config file; update the dependency list asserted in `tests/unit/conventions.test.ts`; fix what `yarn lint` reports; run `yarn lint`
    - Option B, user drops the `yarn lint` part of criterion 3: change nothing in code; only `yarn typecheck` and `yarn test` remain as gates
    - _Requirements: 16.3_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. The unit tests in 6.6 and 6.7 are required; so are the updates to existing tests in 6.1 to 6.5, because they break with the new shapes.
- Task 9.1 waits for the user's decision and must not add a dependency on its own.
- Manual checks from the design (screenshots at 390 px and 1440 px in the three themes, keyboard pass, midnight rollover, applying the migration to a test project and the RLS checklist) are not coding tasks and are left to the user. Requirement 16.5 is checked that way.
- Roll out the migration (task 1.1) before deploying the new client: the new client selects the new columns.
- Each task references specific requirements for traceability.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.3", "2.4", "2.6"] },
    { "id": 2, "tasks": ["2.5", "2.8", "2.10"] },
    { "id": 3, "tasks": ["2.7", "2.9"] },
    { "id": 4, "tasks": ["3.1", "3.5"] },
    { "id": 5, "tasks": ["3.2", "3.3", "5.1", "5.2", "5.3"] },
    { "id": 6, "tasks": ["3.4", "5.4", "5.5"] },
    { "id": 7, "tasks": ["5.6"] },
    { "id": 8, "tasks": ["5.7"] },
    { "id": 9, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.6", "6.7", "6.8", "6.9", "6.11"] },
    { "id": 10, "tasks": ["6.5", "6.10", "6.12", "6.14", "6.15", "6.17", "6.22", "6.25", "6.26", "6.28"] },
    { "id": 11, "tasks": ["6.13", "6.16", "6.18", "6.20", "6.23", "6.27", "6.29"] },
    { "id": 12, "tasks": ["6.19", "6.21", "6.24"] },
    { "id": 13, "tasks": ["8.1"] },
    { "id": 14, "tasks": ["9.1"] }
  ]
}
```
