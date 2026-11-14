# Requirements Document

## Introduction

Reset progress lets a signed-in learner start over without deleting any path. There are two scopes. "Reset this path…" in the hobby options menu on the path page resets one path. "Reset all progress" in the Danger zone of the Settings page resets every path of the account, archived paths included. Each scope offers two modes: "Wipe everything" and "Keep activity history". A confirm dialog gates every reset, and an Undo toast restores the previous state after a successful reset. The path itself (tree, hobby, level, mascot set, archived flag) is never deleted or changed. Demo mode is excluded.

Assumptions made where the scope was silent:
- Activity history is the Completion_Timestamps and Tick_Times of a path. The streak and the activity charts are derived from them.
- The Daily_Bonus_Count contributes XP, so both modes reset it.
- The Weekly_Reward is account-wide. It is reset only by "Reset all progress" in "Wipe everything" mode.

## Glossary

- **Reset_Feature**: The progress reset behavior described in this document, covering the dialog, the database change, and the Undo toast.
- **Path_Page**: The page at `/path` that shows one hobby's skill path.
- **Hobby_Options_Menu**: The options menu of the hobby shown on the Path_Page.
- **Settings_Page**: The account Settings page.
- **Danger_Zone**: The section of the Settings_Page that holds destructive account actions.
- **Reset_Scope**: Either `path` (one path) or `all` (every path of the account, archived paths included).
- **Reset_Mode**: Either `wipe` ("Wipe everything") or `keep_history` ("Keep activity history").
- **Reset_Dialog**: The confirm dialog opened by either entry point. It shows the Reset_Scope, the Reset_Mode choice, a confirm button and a cancel button.
- **Path_Row**: A row of `paths`. Archived and non-archived rows are both Path_Rows.
- **Progress_Row**: The `progress` row of one Path_Row, holding `completed`, `quests`, `completed_at`, `quest_ticks`, `daily_pick` and `daily_bonus_count`.
- **Completion_Progress**: The `completed` and `quests` columns of a Progress_Row.
- **Activity_History**: The `completed_at` and `quest_ticks` columns of a Progress_Row.
- **Daily_Pick**: The `daily_pick` column of a Progress_Row.
- **Daily_Bonus_Count**: The `daily_bonus_count` column of a Progress_Row.
- **Weekly_Reward**: The `weekly_reward_week` and `weekly_reward_count` columns of the learner's profile.
- **Cloud_Store**: The client store that holds the learner's paths, progress rows and Weekly_Reward.
- **Undo_Toast**: The toast shown after a successful reset with an "Undo" action.
- **Undo_Window**: The 8 seconds during which the Undo_Toast is shown.
- **Demo_Mode**: The unauthenticated demo of the Path_Page that uses local sample data.
- **Learner**: The signed-in user.

## Requirements

### Requirement 1: Reset one path

**User Story:** As a learner, I want to reset one path from the path page, so that I can start that hobby over without touching my other hobbies.

#### Acceptance Criteria

1. WHILE the Learner is signed in and the Path_Page shows a path, THE Hobby_Options_Menu SHALL list a "Reset this path…" item.
2. WHEN the Learner selects "Reset this path…", THE Reset_Feature SHALL open the Reset_Dialog with the Reset_Scope `path` for the shown path.
3. WHILE Demo_Mode is active, THE Hobby_Options_Menu SHALL omit the "Reset this path…" item.
4. WHEN a reset with the Reset_Scope `path` succeeds, THE Reset_Feature SHALL leave the Progress_Rows of all other Path_Rows unchanged.

### Requirement 2: Reset all progress

**User Story:** As a learner, I want to reset all my progress from Settings, so that I can start fresh across every hobby.

#### Acceptance Criteria

1. WHILE the Learner is signed in, THE Danger_Zone SHALL list a "Reset all progress" action.
2. WHEN the Learner selects "Reset all progress", THE Reset_Feature SHALL open the Reset_Dialog with the Reset_Scope `all`.
3. WHEN a reset with the Reset_Scope `all` is confirmed, THE Reset_Feature SHALL reset the Progress_Row of every Path_Row of the Learner, including Path_Rows with `archived` set to true.
4. WHILE the Learner has no Path_Rows, THE Danger_Zone SHALL show the "Reset all progress" action as disabled.

### Requirement 3: Reset modes

**User Story:** As a learner, I want to choose between wiping everything and keeping my activity history, so that I can restart a path without losing my streak and activity record.

#### Acceptance Criteria

1. THE Reset_Dialog SHALL offer the two Reset_Modes "Wipe everything" and "Keep activity history" as a single-choice group.
2. WHEN the Reset_Dialog opens, THE Reset_Dialog SHALL preselect "Keep activity history".
3. THE Reset_Dialog SHALL show a one-sentence description under each Reset_Mode that states which data the mode clears and which data it keeps.
4. WHEN the Learner confirms a reset with the Reset_Mode `wipe`, THE Reset_Feature SHALL set Completion_Progress to empty, Activity_History to empty, Daily_Pick to null, and Daily_Bonus_Count to 0 on each Progress_Row in the Reset_Scope.
5. WHEN the Learner confirms a reset with the Reset_Mode `keep_history`, THE Reset_Feature SHALL set Completion_Progress to empty, Daily_Pick to null, and Daily_Bonus_Count to 0 on each Progress_Row in the Reset_Scope.
6. WHEN the Learner confirms a reset with the Reset_Mode `keep_history`, THE Reset_Feature SHALL keep the Activity_History of each Progress_Row in the Reset_Scope unchanged.

### Requirement 4: Weekly reward handling

**User Story:** As a learner, I want the weekly reward handled predictably, so that I know whether my weekly XP survives a reset.

#### Acceptance Criteria

1. WHEN the Learner confirms a reset with the Reset_Scope `all` and the Reset_Mode `wipe`, THE Reset_Feature SHALL set the Weekly_Reward week to null and the Weekly_Reward count to 0.
2. WHEN the Learner confirms a reset with the Reset_Scope `all` and the Reset_Mode `keep_history`, THE Reset_Feature SHALL keep the Weekly_Reward unchanged.
3. WHEN the Learner confirms a reset with the Reset_Scope `path`, THE Reset_Feature SHALL keep the Weekly_Reward unchanged.
4. WHEN a reset completes, THE Cloud_Store SHALL show the new Weekly_Reward, XP, level and streak values on the Path_Page, Quests page and Profile page without a page reload.

### Requirement 5: Daily pick handling

**User Story:** As a learner, I want the daily pick cleared on reset, so that today's quest list matches my fresh progress.

#### Acceptance Criteria

1. WHEN a reset completes in either Reset_Mode, THE Reset_Feature SHALL leave Daily_Pick null on each reset Progress_Row.
2. WHEN the Learner opens the Quests page after a reset, THE Quests page SHALL create a new Daily_Pick from the reset path using the existing daily pick rules.

### Requirement 6: Paths stay intact

**User Story:** As a learner, I want my paths to stay intact when I reset, so that I do not lose the skill tree I generated.

#### Acceptance Criteria

1. WHEN a reset completes, THE Reset_Feature SHALL keep every Path_Row in the Reset_Scope with its `id`, `hobby`, `hobby_id`, `level`, `tree`, `mascot_set`, `model`, `archived` and `created_at` values unchanged.
2. WHEN a reset completes, THE Cloud_Store SHALL keep the shown path selected on the Path_Page.
3. WHEN a reset completes on a path whose Completion_Progress is empty, THE Path_Page SHALL show the first node of the path as the current node.

### Requirement 7: Confirm dialog

**User Story:** As a learner, I want a confirm dialog before anything is reset, so that I do not lose progress by accident.

#### Acceptance Criteria

1. WHEN the Reset_Dialog opens, THE Reset_Dialog SHALL state the Reset_Scope, including the hobby name for the scope `path` and the number of paths for the scope `all`.
2. WHEN the Reset_Dialog opens, THE Reset_Dialog SHALL move keyboard focus to the Cancel button.
3. WHEN the Learner presses Escape or selects Cancel, THE Reset_Feature SHALL close the Reset_Dialog and change no data.
4. THE Reset_Dialog SHALL enable the confirm button without requiring typed text.
5. WHEN the Learner selects the confirm button, THE Reset_Dialog SHALL disable the confirm button, the Reset_Mode choice and the Cancel button until the reset succeeds or fails.
6. WHEN a reset succeeds, THE Reset_Feature SHALL close the Reset_Dialog.

### Requirement 8: Undo toast

**User Story:** As a learner, I want to undo a reset right after it happens, so that a wrong choice is not permanent.

#### Acceptance Criteria

1. WHEN a reset succeeds, THE Reset_Feature SHALL show the Undo_Toast with a message naming the Reset_Scope and an "Undo" action.
2. THE Reset_Feature SHALL keep the Undo_Toast visible for the Undo_Window.
3. WHEN the Learner selects "Undo" within the Undo_Window, THE Reset_Feature SHALL restore the Progress_Rows in the Reset_Scope and the Weekly_Reward to the values they had before the reset, including Activity_History, Daily_Pick and Daily_Bonus_Count.
4. WHEN the Undo succeeds, THE Cloud_Store SHALL show the restored values without a page reload and THE Reset_Feature SHALL show a confirmation toast.
5. IF the Undo fails, THEN THE Reset_Feature SHALL keep the post-reset data and show an error toast.
6. WHEN the Undo_Window ends without an Undo, THE Reset_Feature SHALL discard the saved previous values.
7. WHEN a second reset succeeds while an Undo_Toast is visible, THE Reset_Feature SHALL replace the Undo_Toast and discard the previous saved values.

### Requirement 9: Failure handling

**User Story:** As a learner, I want a clear error when a reset fails, so that I know my data was not changed.

#### Acceptance Criteria

1. IF a reset request fails, THEN THE Reset_Dialog SHALL stay open and show an error message inside the dialog.
2. IF a reset request fails, THEN THE Reset_Feature SHALL leave the Cloud_Store values and the screen behind the dialog unchanged.
3. IF a reset request fails, THEN THE Reset_Feature SHALL leave the stored Progress_Rows and Weekly_Reward unchanged.
4. IF a reset request fails, THEN THE Reset_Feature SHALL not show the Undo_Toast.
5. WHEN a reset request fails, THE Reset_Dialog SHALL re-enable the confirm button, the Reset_Mode choice and the Cancel button.
6. WHEN the Learner changes the Reset_Mode or selects confirm after a failure, THE Reset_Dialog SHALL clear the error message.

### Requirement 10: Atomic reset

**User Story:** As a learner, I want a reset to be all-or-nothing, so that I never end up with a half-reset account.

#### Acceptance Criteria

1. WHEN the Learner confirms a reset, THE Reset_Feature SHALL apply the changes to every Progress_Row in the Reset_Scope and to the Weekly_Reward in one database transaction.
2. THE Reset_Feature SHALL run the reset as the signed-in Learner so that Row Level Security limits the change to the Learner's own rows.
3. IF the Learner has no session when the reset runs, THEN THE Reset_Feature SHALL fail the reset and show the error in the Reset_Dialog.
4. IF the Path_Row of a `path` reset does not belong to the Learner, THEN THE Reset_Feature SHALL fail the reset and change no data.

### Requirement 11: Demo mode excluded

**User Story:** As a visitor trying the demo, I want the demo to stay simple, so that the first 30 seconds are not cluttered with destructive actions.

#### Acceptance Criteria

1. WHILE Demo_Mode is active, THE Path_Page SHALL show no reset action.
2. WHILE no Learner is signed in, THE Reset_Feature SHALL expose no reset entry point.

### Requirement 12: Dialog accessibility

**User Story:** As a learner using a keyboard or a screen reader, I want the reset dialog to be accessible, so that I can use it without a mouse.

#### Acceptance Criteria

1. THE Reset_Dialog SHALL use the `dialog` role with an accessible name and an accessible description.
2. WHILE the Reset_Dialog is open, THE Reset_Dialog SHALL keep keyboard focus inside the dialog.
3. WHEN the Reset_Dialog closes, THE Reset_Feature SHALL return keyboard focus to the control that opened it.
4. IF a reset request fails, THEN THE Reset_Dialog SHALL announce the error message to assistive technology.

### Requirement 13: Changelog entry

**User Story:** As a learner reading the changelog, I want the reset feature listed, so that I can see what changed.

#### Acceptance Criteria

1. WHEN the Reset_Feature is finished, THE CHANGELOG.md SHALL contain one user-facing line under "## [Unreleased]" in the "Added" group that names the two reset entry points and the two Reset_Modes and references "(spec: reset-progress)".
2. WHEN the Reset_Feature entry is added, THE CHANGELOG.md SHALL keep all existing entries unchanged.
