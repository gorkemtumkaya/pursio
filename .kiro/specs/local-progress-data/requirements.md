# Requirements Document

## Introduction

The Path_View from `skill-path-ui` still shows placeholder data: a fixed streak of 6, a fixed "This week" card, a fixed second hobby in the sidebar, navigation items for features that do not exist, and sample "Fresh this week" content on every node. This feature replaces the placeholders with real data kept in the browser's localStorage, and hides what has no real data yet.

`/path?demo=1` keeps showing the Sample_Tree with its demo placeholders.

Scope limits: the implementation plan has at most 6 tasks. Automated tests cover logic only. No new dependencies. No server or account storage.

## Glossary

- **Skill_Tree, Sample_Tree, Progress, Progress_Store, Path_View, Node_Detail, Side_Panel, Bottom_Sheet**: As defined in the `skill-path-ui` spec.
- **Generated_Tree, Start_Screen, Tree_Loader**: As defined in the `ai-skill-tree-generation` spec.
- **Demo_Mode**: `/path` opened with the query `demo=1`.
- **Completion_Log**: The list of timestamps (epoch milliseconds) at which a skill was completed, across all hobbies, kept in localStorage.
- **Local_Day**: A calendar day in the browser's local time zone.
- **Streak**: The number of consecutive Local_Days with at least one Completion_Log entry, counted back from today when today has an entry, else from yesterday. With no entry today or yesterday, the Streak is 0.
- **Week**: The Local_Days Monday to Sunday that contain today.
- **Hobby_Library**: The list of every Generated_Tree the user has built, each with its model id, its own Progress and an Hobby_Id, kept in localStorage, plus the Active_Hobby.
- **Hobby_Id**: The Generated_Tree's `hobby` trimmed, with inner whitespace collapsed and lowercased (`normalizeHobby`).
- **Active_Hobby**: The Hobby_Library entry last opened on `/path`.
- **Hobby_Switcher**: The hobby button in the mobile header.

## Requirements

### Requirement 1: Completion_Log and Streak

**User Story:** As a learner, I want my streak to count the days I actually practised, so that it motivates me honestly.

#### Acceptance Criteria

1. WHEN a skill is completed outside Demo_Mode, THE Path_View SHALL append the current time to the Completion_Log.
2. THE Path_View SHALL show the Streak computed from the Completion_Log in the mobile and desktop headers, in place of the fixed value.
3. WHEN the Completion_Log is missing or unreadable, THE Path_View SHALL treat it as empty and remove an unreadable value.
4. THE Completion_Log SHALL keep at most the 1000 most recent entries.
5. WHILE in Demo_Mode, THE Path_View SHALL show the fixed demo streak and SHALL NOT write to the Completion_Log.

### Requirement 2: "This week" card

**User Story:** As a learner, I want to see which days this week I completed a skill, so that I can keep my rhythm.

#### Acceptance Criteria

1. THE "This week" card SHALL show the seven days of the Week, Monday first, each as done (at least one Completion_Log entry that Local_Day), missed (a past day or today without an entry) or upcoming (a day after today).
2. THE card SHALL show the number of done days in the Week, e.g. "2 days this week".
3. WHEN a skill is completed, THE card SHALL update in the same render.
4. WHILE in Demo_Mode, THE card SHALL show the fixed demo week.

### Requirement 3: Hobby_Library

**User Story:** As a learner with several hobbies, I want every path I generate to be kept with its own progress, so that I can switch between them.

#### Acceptance Criteria

1. WHEN the Start_Screen receives a Generated_Tree, THE Start_Screen SHALL add it to the Hobby_Library, make it the Active_Hobby and open `/path` for it.
2. IF the Hobby_Library already has an entry with the same Hobby_Id, THEN THE Start_Screen SHALL replace that entry's tree and model and reset only that entry's Progress.
3. Every Hobby_Library entry SHALL keep its Progress under its own key, so completing a skill in one hobby never changes another.
4. WHEN the Hobby_Library is missing and a Generated_Tree from the `ai-skill-tree-generation` storage exists, THE Hobby_Library SHALL import it with its Progress as the first entry and remove the old keys.
5. IF a stored Hobby_Library entry is rejected by the Tree_Loader or has no model, THEN THE Hobby_Library SHALL drop that entry and keep the rest.
6. WHEN `/path` opens outside Demo_Mode with `?hobby=<Hobby_Id>` of an existing entry, THE page SHALL show that entry and make it the Active_Hobby; otherwise THE page SHALL show the Active_Hobby, else the most recently added entry.
7. IF the Hobby_Library is empty outside Demo_Mode, THEN `/path` SHALL redirect to the Start_Screen.

### Requirement 4: Sidebar and Hobby_Switcher

**User Story:** As a learner, I want to see all my hobbies with their real progress and jump between them.

#### Acceptance Criteria

1. THE desktop sidebar SHALL list every Hobby_Library entry in the order added, with its hobby name and its percent of completed nodes, and mark the Active_Hobby with `aria-current`.
2. THE Active_Hobby's percent SHALL update in the same render as a completion.
3. WHEN the Hobby_Switcher is activated, THE Path_View SHALL open a Bottom_Sheet with the same list, and closing it SHALL return focus to the Hobby_Switcher.
4. WHEN an entry is selected in the sidebar or the Bottom_Sheet, THE app SHALL open `/path?hobby=<Hobby_Id>`.
5. "+ Add a hobby" in the sidebar and the Bottom_Sheet SHALL open the Start_Screen.
6. WHILE in Demo_Mode, THE list SHALL show the demo entries, which do nothing when selected.

### Requirement 5: Hide features that do not exist yet

#### Acceptance Criteria

1. THE desktop and mobile navigation SHALL show only the Path item; the Fresh, Quests and Profile items SHALL NOT be shown.
2. THE Node_Detail SHALL show the "Fresh this week" section only when the node has content.
3. Outside Demo_Mode no node has content yet. In Demo_Mode, nodes keep the sample content from `fresh-samples.ts`.
