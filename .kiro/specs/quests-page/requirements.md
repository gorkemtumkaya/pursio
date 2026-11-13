# Requirements Document

## Introduction

Pursio gets a Quests page at `/quests`, designed in `dev_docs/Desktop · Quests@1x.png` and `dev_docs/Mobile · Quests@1x.png`. The page shows three "Today's quests" picked from the learner's current hobby, a bonus for finishing all three, a weekly challenge that counts active days across all hobbies, a quest log of the current week, and a "From your path" section.

A quest is one of the three quests of a skill, identified by the skill id and the quest index (0, 1 or 2). Ticking a quest on the Quests page and on the path is the same action and changes the same Progress. Each tick records its own time. These times feed the streak, the "This week" card, the weekly challenge and the quest log. Quests give XP, the daily bonus gives extra XP, and the weekly challenge reward is added to the learner's total XP. Skills stay at 50 XP, and "Mark complete" on the path stays as it is.

### Review flags: where these requirements differ from the brief

These points differ from the original brief wording or from the mockups, or fill a gap the brief left open. They are listed here so they can be checked in review. The original brief text was not available while writing; the flags compare against the two mockups and the decisions given for this spec.

1. **Flat quest XP.** Every quest gives +10 XP. The mockups show +10, +15 and +5 XP on the three rows.
2. **Weekly challenge counts all hobbies.** The title is "Practice on 4 days this week" and any quest ticked in any hobby counts. The mockup says "Climb on 4 days this week", which names one hobby.
3. **Weekly reward is XP only, and goes to total XP.** The reward is +50 XP added to the learner's total XP on the Profile page, not to one hobby's XP or level. The mockup's "and a chalk bag for Wick" is dropped, because Wick accessories come from the hobby, not from rewards.
4. **Quest log counts all hobbies.** The mockup places the log on a bouldering page; the log here sums quests over every hobby, archived ones included (like the streak).
5. **No Fresh quest.** Today's quests all come from the path. The mockup's "Watch one Fresh video" row is not built, because Fresh is not built and stays hidden.
6. **Fresh stays hidden in the navigation.** The mockups show a Fresh item; the navigation shows Path, Quests and Profile.
7. **No 2-of-3 gate.** "Mark complete" stays on the path and works as today, whatever the quests say. A skill is never completed by ticking quests.
8. **Session required.** `/quests` needs a session like `/profile` and is not available in demo mode (`/path?demo=1`).
9. **Streak and "This week" now include quest ticks.** Today only completed skills count. After this feature a day counts when a skill was completed or a quest was ticked on it.
10. **Hobby XP and level change.** The path XP bar and each hobby's level now include quest XP and daily bonuses, so levels rise faster than before. Quests ticked before this feature count for XP too, but have no tick time, so they do not appear in the streak, the weekly challenge or the quest log.
11. **Quest log on mobile.** The mobile mockup shows no quest log; this spec shows it below the weekly challenge, because the brief asks for it.
12. **Daily bonus needs a full pick of 3.** If the hobby has fewer than 3 quests left to pick, the page shows those quests without a bonus. This case is not in the brief.
13. **Pick order is specified here.** The brief does not give the order in which Today's quests are chosen; Requirement 4 sets one (current skill first, then side quests, then other open skills). Confirm it in review.
14. **`yarn lint` does not exist yet.** `package.json` has no `lint` script and no linter configuration. Adding one means a new dependency, which needs approval first (see "Needs approval before work starts").

### Needs approval before work starts

The brief asks for `yarn lint` to pass. The project has no `lint` script. Adding a linter adds a new dependency, and per the project rules no dependency is added without approval. Until a linter is approved or the criterion is dropped, Requirement 16 criterion 3 cannot be checked.

### Out of scope

The Fresh quest and any Fresh content, Wick accessories as rewards, per-hobby weekly challenges, choosing or rerolling Today's quests, push notifications, leaderboards, and quest XP that differs per quest.

## Glossary

- **Skill_Tree, Node, Progress, Progress_Engine, Demo_Mode, Mark_Complete**: As defined in the `skill-path-ui` and `local-progress-data` specs. "Mark_Complete" is the "Mark complete" button on the path.
- **Hobby_Library, Hobby_Id, Active_Hobby, Streak, Week**: As defined in the `local-progress-data` spec.
- **Cloud_Store, Path_Row, Progress_Row, Profile_Row, Save_Queue, Migrations, Setup_Guide, Profile_Page, Session**: As defined in the `accounts-cloud-save` spec.
- **Quests_Page**: The page at `/quests`.
- **Quest**: One of the three quests of a Node.
- **Quest_Id**: The pair (Node id, quest index), where the index is 0, 1 or 2. Two Quests are the same Quest only when both parts match.
- **Ticked**: The state of a Quest whose box is checked in Progress.
- **Tick_Time**: The time, in epoch milliseconds, at which a Quest was last ticked. A Quest that is not Ticked has no Tick_Time.
- **Local_Day**: A calendar day in the learner's local time zone, written `YYYY-MM-DD`.
- **Week_Key**: The Local_Day of the Monday of a Week.
- **Open_Node**: A Node that is not completed and whose prerequisites are all completed.
- **Current_Node**: The first Open_Node, in document order, that is not a side quest.
- **Daily_Pick**: The record stored per hobby for one Local_Day: the Local_Day, the list of up to 3 Quest_Ids chosen for it and a flag that tells whether the Daily_Bonus was granted.
- **Today_Quests**: The Quests listed in the Daily_Pick of the Active_Hobby for the current Local_Day.
- **Daily_Bonus**: +20 XP, granted once per hobby per Local_Day when all 3 Quests of the Daily_Pick are Ticked.
- **Daily_Bonus_Count**: The number of Daily_Bonuses granted for a hobby, stored in its Progress_Row.
- **Quest_XP**: +10 XP for each Ticked Quest.
- **Skill_XP**: 50 XP for each completed Node, as defined in the `skill-path-ui` spec.
- **Hobby_XP**: Skill_XP plus Quest_XP plus 20 XP for each entry of the Daily_Bonus_Count, over one hobby.
- **Total_XP**: The sum of Hobby_XP over all paths, archived ones included, plus Weekly_Reward_XP.
- **Active_Day**: A Local_Day on which at least one Quest of any hobby has its Tick_Time.
- **Weekly_Challenge**: The goal "Practice on 4 days this week": reach 4 Active_Days within one Week.
- **Weekly_Reward**: +50 XP, granted once per Week when the Weekly_Challenge is reached.
- **Weekly_Reward_Week**: The Week_Key of the latest Week for which the Weekly_Reward was granted, stored in the Profile_Row.
- **Weekly_Reward_Count**: The number of Weekly_Rewards granted to the learner, stored in the Profile_Row.
- **Weekly_Reward_XP**: 50 XP for each entry of the Weekly_Reward_Count.
- **Quest_Log**: The row of seven day boxes, Monday to Sunday of the current Week, each showing the number of Quests with a Tick_Time on that Local_Day, over all hobbies.
- **Path_Section**: The "From your path" section of the Quests_Page.

## Requirements

### Requirement 1: Route, navigation and access

**User Story:** As a learner, I want a Quests page in the main navigation, so that I can find my daily and weekly goals in one place.

#### Acceptance Criteria

1. THE Quests_Page SHALL be served at `/quests` inside the app shell used by the Profile_Page.
2. THE main navigation SHALL show the items Path, Quests and Profile, in that order, on the sidebar (desktop) and on the bottom bar (mobile).
3. WHILE the open page is `/quests`, THE main navigation SHALL mark the Quests item as the current page.
4. WHILE Demo_Mode is active, THE main navigation SHALL hide the Quests item.
5. WHEN `/quests` is opened, THE Quests_Page SHALL start the Session the same way the Profile_Page does and show a loading state until the Cloud_Store is ready.
6. IF the Cloud_Store fails to load, THEN THE Quests_Page SHALL show the same retry notice and message as the Profile_Page, with a "Retry" action that reloads the Cloud_Store.
7. IF the learner has no hobby that is not archived, THEN THE Quests_Page SHALL show an empty state with a link to `/new`.

### Requirement 2: Quest identity and tick times

**User Story:** As a learner, I want a quest to be the same quest wherever I tick it, so that my progress never differs between the path and the Quests page.

#### Acceptance Criteria

1. THE Progress_Engine SHALL identify a Quest by its Quest_Id.
2. WHEN a Quest is ticked on the path or on the Quests_Page, THE Cloud_Store SHALL set the Tick_Time of that Quest_Id to the current time in the same update that changes Progress.
3. WHEN a Ticked Quest is unticked, THE Cloud_Store SHALL remove the Tick_Time of that Quest_Id in the same update that changes Progress.
4. THE Cloud_Store SHALL keep at most one Tick_Time per Quest_Id.
5. WHEN a Quest is ticked or unticked, THE Quests_Page and the path SHALL show the new state of that Quest in the same render.
6. WHEN the Cloud_Store loads a Progress_Row, THE Cloud_Store SHALL drop Tick_Times of Quest_Ids that are not Ticked or whose Node is not in the tree.

### Requirement 3: XP from quests, bonuses and rewards

**User Story:** As a learner, I want quests to give XP, so that small steps feel worth taking.

#### Acceptance Criteria

1. THE Progress_Engine SHALL compute Hobby_XP as Skill_XP plus Quest_XP plus 20 XP for each entry of the Daily_Bonus_Count of that hobby.
2. THE Progress_Engine SHALL give every Ticked Quest +10 XP, whatever the Node or index.
3. THE Progress_Engine SHALL keep Skill_XP at 50 XP for each completed Node.
4. THE Profile_Page SHALL compute Total_XP and the learner's level from it.
5. THE path XP bar and the level of each hobby row SHALL use Hobby_XP and exclude Weekly_Reward_XP.
6. WHEN a Ticked Quest is unticked, THE Progress_Engine SHALL remove its +10 XP from the Hobby_XP.
7. WHEN a Ticked Quest is unticked after the Daily_Bonus or the Weekly_Reward was granted, THE Progress_Engine SHALL keep the Daily_Bonus_Count and the Weekly_Reward_Count unchanged.

### Requirement 4: Daily pick

**User Story:** As a learner, I want three small quests picked for me each day, so that I always know what to do next in my hobby.

#### Acceptance Criteria

1. WHEN the Quests_Page is ready and the Active_Hobby has no Daily_Pick for the current Local_Day, THE Quests_Page SHALL create a Daily_Pick for the Active_Hobby and store it in its Progress_Row.
2. THE Quests_Page SHALL choose the Active_Hobby as the Profile_Page does: the stored Active_Hobby, otherwise the last hobby added, among hobbies that are not archived.
3. THE Daily_Pick SHALL contain only Quest_Ids that are not Ticked at the moment of the pick and whose Node is an Open_Node.
4. THE Daily_Pick SHALL order candidate Quests by Node group first, then by document order of the Node, then by quest index ascending, with the groups in this order: the Current_Node, then Open_Nodes that are side quests, then all other Open_Nodes.
5. THE Daily_Pick SHALL contain the first 3 candidates in that order, or all candidates when fewer than 3 exist.
6. WHILE the Local_Day of a stored Daily_Pick equals the current Local_Day, THE Quests_Page SHALL show the same Quest_Ids, in the same order, even when Nodes are completed or Quests are ticked meanwhile.
7. WHEN the current Local_Day differs from the Local_Day of the stored Daily_Pick, THE Quests_Page SHALL replace the stored Daily_Pick with a new one for the current Local_Day.
8. WHEN the Local_Day changes while the Quests_Page is open, THE Quests_Page SHALL create the new Daily_Pick for the new Local_Day without a reload.
9. IF the Active_Hobby has no candidate Quest, THEN THE Quests_Page SHALL show the message "You're all caught up on this path" in place of the quest list.

### Requirement 5: Today's quests card

**User Story:** As a learner, I want to see and tick today's quests, so that I can track my day at a glance.

#### Acceptance Criteria

1. THE Quests_Page SHALL show the card "Today's quests" with a ring that shows the number of Ticked Quests of the Daily_Pick over the size of the Daily_Pick, written like "1/3".
2. THE Quests_Page SHALL list each Quest of the Daily_Pick with a checkbox, the quest text, the title of its Node and the label "+10 XP".
3. WHILE a Quest of the Daily_Pick is Ticked, THE Quests_Page SHALL show its text with a strike-through and its checkbox as checked.
4. WHEN the learner activates the checkbox of a Quest, THE Quests_Page SHALL toggle the Ticked state of that Quest_Id.
5. WHILE the Daily_Pick holds 3 Quests, THE Quests_Page SHALL show the text "Finish all 3 for +20 bonus XP".
6. THE Quests_Page SHALL show the time until the next local midnight on the card as "RESETS IN 9H", rounded down to whole hours when 1 hour or more remains, and as "RESETS IN 42M" in whole minutes otherwise.
7. WHILE the Daily_Bonus of the current Local_Day is granted, THE Quests_Page SHALL replace the bonus text with "Bonus earned: +20 XP".
8. THE Quests_Page SHALL show the name of the Active_Hobby as a small heading above the page title "Quests" on desktop.

### Requirement 6: Daily bonus

**User Story:** As a learner, I want a bonus for finishing all of today's quests, so that finishing the day feels rewarded.

#### Acceptance Criteria

1. WHEN the last Quest of a Daily_Pick that holds 3 Quests becomes Ticked and the Daily_Bonus of that Daily_Pick is not granted, THE Cloud_Store SHALL grant the Daily_Bonus by setting the flag of the Daily_Pick and adding 1 to the Daily_Bonus_Count of that hobby.
2. WHEN a Quest of the Daily_Pick is ticked on the path, THE Cloud_Store SHALL apply the same bonus rule as when the Quest is ticked on the Quests_Page.
3. WHILE the flag of a Daily_Pick says the Daily_Bonus was granted, THE Cloud_Store SHALL keep the Daily_Bonus_Count unchanged when Quests of that Daily_Pick are unticked and ticked again.
4. WHEN a new Daily_Pick replaces the stored one, THE Cloud_Store SHALL keep the Daily_Bonus_Count unchanged.
5. IF a Daily_Pick holds fewer than 3 Quests, THEN THE Cloud_Store SHALL grant no Daily_Bonus for that Daily_Pick.
6. WHEN the Daily_Bonus is granted, THE Quests_Page SHALL show a toast "+20 bonus XP" when the Quests_Page is the open page.

### Requirement 7: Weekly challenge

**User Story:** As a learner, I want a weekly goal that counts my practice across all my hobbies, so that I am rewarded for showing up, whatever I practice.

#### Acceptance Criteria

1. THE Quests_Page SHALL show the card "Weekly challenge" with the title "Practice on 4 days this week".
2. THE Quests_Page SHALL count Active_Days of the current Week over the Tick_Times of all hobbies, archived ones included.
3. THE Quests_Page SHALL show 4 progress segments, of which the first N are filled, where N is the number of Active_Days limited to 4.
4. THE Quests_Page SHALL show the text "N of 4 · Reward: +50 XP", where N is the number of Active_Days limited to 4.
5. THE Quests_Page SHALL show the days left in the Week after today as "N days left", "1 day left" for one day, and "Last day" on Sunday.
6. WHILE the Weekly_Reward_Week equals the Week_Key of the current Week, THE Quests_Page SHALL show the text "Reward earned: +50 XP" in place of the reward text.
7. WHEN the Local_Day changes to a new Week, THE Quests_Page SHALL show 0 Active_Days for the new Week.

### Requirement 8: Weekly reward

**User Story:** As a learner, I want the weekly reward added to my total XP once per week, so that the reward counts for me and not for one hobby.

#### Acceptance Criteria

1. WHEN a Quest is ticked and the Active_Days of the current Week reach 4 and the Weekly_Reward_Week differs from the Week_Key of the current Week, THE Cloud_Store SHALL grant the Weekly_Reward by setting the Weekly_Reward_Week to that Week_Key and adding 1 to the Weekly_Reward_Count.
2. WHEN a Quest is ticked on the path, THE Cloud_Store SHALL apply the same reward rule as when the Quest is ticked on the Quests_Page.
3. WHILE the Weekly_Reward_Week equals the Week_Key of the current Week, THE Cloud_Store SHALL keep the Weekly_Reward_Count unchanged, even when Quests are unticked and ticked again.
4. WHEN a new Week starts, THE Cloud_Store SHALL allow one new Weekly_Reward for that Week.
5. THE Profile_Page SHALL include the Weekly_Reward_XP in the XP total it shows.
6. WHEN the Weekly_Reward is granted, THE Quests_Page SHALL show a toast "+50 XP weekly reward" when the Quests_Page is the open page.
7. IF the Cloud_Store deletes a path, THEN THE Cloud_Store SHALL keep the Weekly_Reward_Week and the Weekly_Reward_Count unchanged.

### Requirement 9: Quest log

**User Story:** As a learner, I want to see how many quests I finished on each day this week, so that I can see my rhythm.

#### Acceptance Criteria

1. THE Quests_Page SHALL show the card "Quest log" with seven boxes labelled M, T, W, T, F, S and S for Monday to Sunday of the current Week.
2. THE Quests_Page SHALL show in each box of a Local_Day up to and including today the number of Quests, over all hobbies, whose Tick_Time falls on that Local_Day.
3. WHILE a box belongs to a Local_Day before today and its number is 1 or more, THE Quests_Page SHALL show the box in the done style.
4. WHILE a box belongs to a Local_Day before today and its number is 0, THE Quests_Page SHALL show the box in the missed style with the number 0.
5. WHILE a box belongs to today, THE Quests_Page SHALL show the box with an outline and its number.
6. WHILE a box belongs to a Local_Day after today, THE Quests_Page SHALL show the box empty, without a number.
7. THE Quests_Page SHALL show the caption "Number = quests finished that day".
8. THE Quests_Page SHALL give each box an accessible name with the day name and the number, such as "Monday, 2 quests".

### Requirement 10: Streak and "This week" from quest ticks

**User Story:** As a learner, I want my streak to count the days I ticked a quest, so that small steps keep my streak alive.

#### Acceptance Criteria

1. THE Streak and the "This week" card SHALL count a Local_Day as active when it holds at least one skill completion time or at least one Tick_Time, over all paths, archived ones included.
2. WHEN a Quest is ticked, THE Streak and the "This week" card SHALL update in the same render.
3. WHEN a Quest is unticked, THE Streak and the "This week" card SHALL remove the Local_Day of its Tick_Time if no other skill completion time or Tick_Time falls on that Local_Day.
4. THE Profile_Page SHALL use the same active days for its Streak and for the 3-day and 7-day streak milestones.

### Requirement 11: From your path

**User Story:** As a learner, I want to see where my path continues, so that I can jump from today's quests to the skill behind them.

#### Acceptance Criteria

1. THE Quests_Page SHALL show the Path_Section with a card for the Current_Node of the Active_Hobby.
2. WHERE the Active_Hobby has an Open_Node that is a side quest, THE Quests_Page SHALL show a second card for the first such Open_Node in document order.
3. THE card of a Node SHALL show the Node title, the label "Current skill" or "Side quest", a progress bar of its Ticked Quests over 3, and the line "Next: " followed by the text of its first Quest that is not Ticked.
4. IF all 3 Quests of a Node are Ticked, THEN THE card of that Node SHALL show the line "All quests done. Mark the skill complete on your path." in place of the "Next" line.
5. WHEN the learner activates a card, THE Quests_Page SHALL navigate to the path of the Active_Hobby.
6. IF the Active_Hobby has no Current_Node, THEN THE Quests_Page SHALL hide the Path_Section.
7. WHILE the viewport is 390px wide, THE Quests_Page SHALL show the Path_Section as one row with the Node title and "N of 3 quests".

### Requirement 12: Skill completion stays on the path

**User Story:** As a learner, I want to complete a skill when I decide to, so that ticking quests never blocks or triggers my progress.

#### Acceptance Criteria

1. THE path SHALL keep Mark_Complete as the only way to complete a Node.
2. WHEN a Node is open, THE path SHALL allow Mark_Complete whatever number of its Quests are Ticked, including 0.
3. WHEN Mark_Complete completes a Node, THE Progress_Engine SHALL add Skill_XP of 50 XP and keep the Ticked Quests of that Node.
4. WHEN the last Quest of a Node is ticked, THE Progress_Engine SHALL leave the Node uncompleted.
5. THE Quests_Page SHALL offer no Mark_Complete action.

### Requirement 13: Storage and migration

**User Story:** As a learner, I want my quest data saved to my account, so that my daily pick, bonuses and weekly reward follow me to every device.

#### Acceptance Criteria

1. THE Migrations SHALL add a new file in `supabase/migrations/`, ordered after the existing files, that adds to the `progress` table the columns for the Tick_Times, the Daily_Pick and the Daily_Bonus_Count.
2. THE Migrations SHALL add to the `profiles` table the columns for the Weekly_Reward_Week and the Weekly_Reward_Count.
3. THE Migrations SHALL give every new column a default or allow null, so that existing rows stay valid and are read as: no Tick_Times, no Daily_Pick, Daily_Bonus_Count 0, no Weekly_Reward_Week and Weekly_Reward_Count 0.
4. THE Migrations SHALL constrain the Daily_Bonus_Count and the Weekly_Reward_Count to values of 0 or more.
5. THE Migrations SHALL leave the existing Row Level Security policies in force for the new columns, so that a user reaches only their own values.
6. THE Setup_Guide SHALL list the new migration file in the order of application.
7. WHEN Progress changes on a path, THE Cloud_Store SHALL send the Tick_Times, the Daily_Pick and the Daily_Bonus_Count with the Progress through the Save_Queue.
8. WHEN the Weekly_Reward is granted, THE Cloud_Store SHALL save the Weekly_Reward_Week and the Weekly_Reward_Count to the Profile_Row.
9. WHEN the Cloud_Store restores a deleted path (Undo), THE Cloud_Store SHALL restore its Tick_Times, Daily_Pick and Daily_Bonus_Count.
10. IF a stored Daily_Pick, Tick_Time value, count or Weekly_Reward_Week has a wrong shape, THEN THE Cloud_Store SHALL read it as empty or 0 and keep loading the path.
11. IF a save of the quest data fails, THEN THE Cloud_Store SHALL show the same "Couldn't save your last change." toast with a "Retry" action as for other Progress writes.
12. THE `save_generated_path` database function SHALL keep resetting the progress row of a regenerated path, which also clears its Tick_Times, Daily_Pick and Daily_Bonus_Count.

### Requirement 14: Loading, errors and empty states

**User Story:** As a learner, I want the page to tell me what is happening, so that a slow or failed load does not look like lost progress.

#### Acceptance Criteria

1. WHILE the Cloud_Store status is not `ready` and not `error`, THE Quests_Page SHALL show the loading state with the message "Loading your quests…".
2. WHILE the Cloud_Store status is `ready`, THE Quests_Page SHALL show the Today's quests card, the Weekly challenge card, the Quest_Log and the Path_Section in the layout of the mockups.
3. IF the Session is not available, THEN THE Quests_Page SHALL show the same session gate as the Profile_Page.
4. WHILE the current Week has no Tick_Time, THE Quests_Page SHALL show the Quest_Log with each box up to and including today at 0 and the Weekly challenge with 0 filled segments.

### Requirement 15: Responsive layout, theme and accessibility

**User Story:** As a learner, I want the page to work on my phone and my laptop and with the keyboard, so that I can use it anywhere.

#### Acceptance Criteria

1. WHILE the viewport is 390px wide, THE Quests_Page SHALL show one column in this order: page title, Today's quests card, Weekly challenge card, Quest_Log, Path_Section, with no horizontal scroll.
2. WHILE the viewport is 1440px wide, THE Quests_Page SHALL show the main column with the Today's quests card and the Path_Section, and a right column with the Weekly challenge card and the Quest_Log.
3. THE Quests_Page SHALL take all colors, fonts, radii and shadows from the theme tokens, so that the themes boulder, trail and halloween all render without markup changes.
4. THE Quests_Page SHALL let the learner reach and operate every checkbox, card link and navigation item with the keyboard, in reading order.
5. WHILE an interactive element has keyboard focus, THE Quests_Page SHALL show a visible focus outline on it.
6. THE Quests_Page SHALL give each quest checkbox an accessible name made of the quest text and its Node title.
7. THE Quests_Page SHALL expose the ring value and the weekly progress to assistive technology as text, such as "1 of 3 quests done" and "2 of 4 days".

### Requirement 16: Tests and quality gates

**User Story:** As the project owner, I want the new rules covered by tests and the checks green, so that the XP rules cannot break unnoticed.

#### Acceptance Criteria

1. THE test suite SHALL contain unit tests for the Daily_Pick that cover: the order of the groups, the order inside a group, the limit of 3, fewer than 3 candidates, exclusion of Ticked Quests, exclusion of locked and completed Nodes, and the same result for the same input.
2. THE test suite SHALL contain unit tests for the bonus rules that cover: the Daily_Bonus granted once per Daily_Pick, no second Daily_Bonus after untick and tick, no Daily_Bonus for a Daily_Pick of fewer than 3 Quests, a new Daily_Bonus on the next Local_Day, the Weekly_Reward granted once per Week, a new Weekly_Reward in the next Week, and an unchanged Weekly_Reward_Count after Quests are unticked.
3. WHEN the implementation is complete, THE project SHALL pass `yarn lint` and `yarn typecheck`.
4. WHEN the implementation is complete, THE project SHALL pass `yarn test`.
5. WHEN the implementation is complete, THE Quests_Page SHALL render without layout errors at 390px and at 1440px wide.
6. WHEN the implementation is complete, THE `CHANGELOG.md` SHALL hold entries under "Unreleased" for the Quests page, the quest XP and the changed streak, each marked "(spec: quests-page)".
