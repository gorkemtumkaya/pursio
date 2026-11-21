# Requirements Document

## Introduction

Path intake gives the generator more than the hobby. The learner may write a short Note on `/new`. A small model reads it into a Learner_Profile, a short Panel shows what was understood and asks at most 2 tap questions, and generation uses the Final_Profile: where the path starts, where it ends, what it leaves out, and which skills the learner already has. The user scenarios and the owner's decisions are in [scenarios.md](scenarios.md); requirements refer to decisions as "(decision n)".

This spec changes three earlier specs. Everything in them that this document does not replace stays in force.

| Earlier spec | What changes | Replaced by |
|---|---|---|
| `new-hobby-page` | The level picker "Where are you now?" is removed. "Build my path" starts intake, not generation. The ready card gains two lines | Requirements 1, 3, 4, 12 |
| `ai-skill-tree-generation` | The Tree_Route accepts a profile, the Start_Level comes from it, the cache is used only for a Plain_Profile, and the generator and Tree_Loader follow the profile | Requirements 7, 8 |
| `skill-path-ui`, `local-progress-data`, `quests-page` | Known_Nodes count as completed and give 30 XP. Their quests are Refresher_Quests | Requirements 9, 10 |
| `landing-page`, Req 11 (hobby handoff) | The handoff fills the hobby and starts intake, not generation | Requirement 1, criteria 6 and 7 |
| `accounts-cloud-save` | The Path_Row gains a profile, and the save function stores it | Requirement 11 |

Design references, in `dev_docs/new-path-generator-designs/`:

- `NEW · Desktop new hobby (Tweaks startState, knownStyle).png`: the Panel on desktop;
- `NEW · Mobile · Guitar, read from what you typed.png`: the Panel on mobile, with three Chips;
- `NEW · Mobile · Sandwich, taste question.png`: one Chip, the known skills question and the taste question;
- `NEW · Mobile · Ready, finish line + head start.png`: the ready card.

Where the owner decisions differ from the mockups, the decisions win (AS1, AS11, AS12).

Out of scope (decision 14): changing the goal of an existing path, swapping one skill, reshaping an existing path, and any change to Fresh or to quests outside generation. The Settings goal and the Goal_Class stay as they are (decision 20).

## Glossary

Terms from earlier specs keep their meaning: Skill_Tree, Node, Main_Node, Section, Progress, Progress_Engine, Current_Node, Open_Node, Mark_Complete, Hobby_XP, Daily_Pick, Daily_Bonus, Tick_Time, Streak, Week, Quests_Page, Path_Row, Progress_Row, Access_Token, Tree_Loader, Validation_Error, Provider_Adapter, User_Config, Default_Config, Billable_Generation, Normalized_Hobby, Language_Code, Goal_Class, Demo_Mode. New or changed terms:

- **Note**: the optional text the learner writes under "Tell Wick more", at most 800 characters after trim (decision 40).
- **Intake_Endpoint**: `POST /api/intake`.
- **Small_Model**: the fast model used for intake, one per provider. Its id comes from the server config, which has a default for each provider (decision 32). No model id is fixed by this document.
- **Intake_Level**: `new`, `returning`, `regular` or null.
- **Start_Level**: the existing level of a path, `new`, `some` or `serious`, stored in `paths.level`.
- **Option**: `{ id, label }`. A **Goal_Option** is `{ id, label, finishLine }`.
- **Intake_Profile**: what the Intake_Endpoint returns: `level`, `goal` (one of the `goalOptions`, or null), `avoid`, `taste`, `goalOptions`, `knownOptions`, `tasteOptions` and `mascotSet`.
- **Mascot_Set**: one of the outfit values the generator may already return in `mascot.set`. The default outfit is `explorer`.
- **Sanitizer**: the function that turns a model answer into a valid Intake_Profile or a failure (Requirement 2, criterion 8).
- **Detected_Field**: one of `level`, `goal`, `avoid`, `taste` that is filled in the Intake_Profile: a level that is not null, a goal that is not null, or a list with at least 1 entry.
- **Chip**: the removable label of one Detected_Field in the Panel.
- **Panel**: the block that opens under the inputs of `/new` after intake, with the Chips, the questions and two buttons.
- **Known_Skill**: a `knownOptions` entry the learner selected in the Panel.
- **Final_Profile**: what the learner confirmed: `level`, `goal`, `avoid`, `taste`, `known` (the Known_Skills, 0 to 6) and `goalOptions`. It is sent to the Tree_Route.
- **Plain_Profile**: a Final_Profile with a null goal, an empty `avoid`, an empty `taste` and an empty `known`. A request without a profile counts as plain too.
- **Stored_Profile**: the Final_Profile as saved in `paths.profile`, with `known` cut down to the Known_Skills that have a Node in the tree (decision 31).
- **Finish_Line**: `goal.finishLine`, the goal written as a final milestone, at most 60 characters.
- **Final_Milestone**: the last Node of the last Section of a Skill_Tree.
- **Known_Node**: a Node of a path's Skill_Tree whose `knownOptionId` equals the `id` of a Known_Skill in that path's Stored_Profile. A title is never used for this match (decision 28).
- **Head_Start_XP**: 30 × the number of Known_Nodes of a path, counting at most 6.
- **Refresher_Quest**: a quest of a Known_Node.
- **Effective_Completed**: the completed Node ids of the Progress, plus the ids of the Known_Nodes.
- **Intake_Failure**: any intake outcome that is not a valid Intake_Profile within 5 s: an HTTP error, a timeout, a network error, an answer the Sanitizer cannot repair, a rate limit, or "not a hobby".

## Assumptions

Small points the decisions do not settle. Each is open to change.

- **AS1. Copy the mockups do not show.** Approved by the owner on 2026-11-21. The mockups give most of the copy of Requirement 15, criterion 2. Four lines are not in them and are proposals: the Note placeholder, the Note counter, Wick's line while intake runs, and Wick's line for a Panel with no Chip. The counter appears only when 40 or fewer characters are left, so the field looks as in the mockup until then.
- **AS2. Focus when the Panel opens.** Focus moves to the heading "Here's what I got" when at least 1 Chip is shown, and to the first question when none is. A landing handoff has no Note and so no Chip, which gives decision 19 its "focus on the first question".
- **AS3. Known_Nodes come first.** The prompt asks for Known_Nodes as the first Main_Nodes of the first Section, which may hold its usual 4 to 7 Nodes in addition to them, so a learner with 6 Known_Skills still finds new skills before the first milestone. This is a prompt rule only: a tree that places them elsewhere is not rejected (decision 31), and the Progress_Engine handles a completed Node at any place.
- **AS4. Avoid and taste are instructions.** Code cannot tell whether a quest "matches" an avoid entry, so avoid and taste are rules in the prompt, checked by hand (manual test matrix) and not by the Tree_Loader. A wrong rejection would block a path, which decision 11 forbids in spirit.
- **AS5. Known skills are not activity.** A Known_Node has no completion time, and the day a path is created is not an active day for the Streak or the Week because of its Known_Nodes.
- **AS6. Reading known skills in Fresh.** Fresh rules do not change, but the two values Fresh reads from a path, the current skill and the number of completed skills, use Effective_Completed. Without this, Fresh would show videos for a skill the learner already has.
- **AS7. What is stored.** The Stored_Profile keeps `goalOptions`, for the later "change goal" feature. It does not keep `knownOptions` or `tasteOptions`, and never the Note.
- **AS8. A failed save costs a new generation.** A tree built for a profile that is not plain is not cached (decision 27). If its save fails, "Try again" generates again and uses the hourly limit once more.
- **AS9. Server limit for intake.** The Intake_Endpoint stops its model call after 5 s, the same limit as the client.
- **AS10. Empty Note.** With an empty Note the server sets level and goal to null and avoid and taste to empty lists, whatever the model answered. This makes "never invent" certain for the most common case.
- **AS11. "You can change your goal later from the path."** Approved by the owner on 2026-11-21. The desktop mockup shows this line under the Panel buttons. Changing the goal is out of scope (decision 14), so the line is left out until that feature exists.
- **AS12. Wick's outfit in the Panel.** Settled by decision 33: intake returns `mascotSet` and Wick wears it in the Panel.
- **AS14. Where a `knownOptionId` is kept.** The Tree_Route keeps a `knownOptionId` only on a Main_Node that is not a milestone. On a milestone or a side quest it is stripped like an unknown id, so the Final_Milestone and the section milestones are never done at the start.
- **AS13. Hobby and Note stay visible.** As in the mockups, the hobby and the Note stay above the Panel and can be edited, which closes the Panel (Requirement 4, criterion 9).

## Requirements

### Requirement 1: Inputs on the new hobby page

**User Story:** As a learner, I want to add a few words about myself next to the hobby, so that the path fits me, without being forced to.

#### Acceptance Criteria

1. WHILE `/new` is in the input state, THE page SHALL show the hobby field as today and, below it, a textarea labelled "Tell Wick more", marked "optional" next to the label, that accepts at most 800 characters.
2. WHILE 40 or fewer characters are left in the Note, THE page SHALL show "<n> left" and SHALL link that text to the textarea for screen readers (AS1).
3. THE page SHALL NOT show the level picker "Where are you now?" or any other control for the Start_Level (decision 15).
4. IF the hobby is empty after trim, THEN "Build my path" SHALL send no request, whatever the Note holds.
5. WHEN the learner taps an idea chip or "Surprise me", THE page SHALL fill the hobby field, keep the Note and send no request.
6. WHEN `/new` opens with a valid `hobby` query value and a session is ready, THE page SHALL fill the hobby field, leave the Note empty and start intake as in Requirement 3 (decision 19). IF that intake ends in an Intake_Failure, THEN generation SHALL start at once, as today.
7. THE handoff of criterion 6 SHALL run at most once per page load and SHALL remove `hobby` from the URL, so a refresh or the back button starts nothing, as today.

### Requirement 2: Intake_Endpoint

**User Story:** As a learner, I want Pursio to understand my note quickly, so that I answer only what it could not read.

#### Acceptance Criteria

1. THE Intake_Endpoint SHALL require a valid Access_Token, checked as the Tree_Route checks it. IF the token is missing, invalid or cannot be checked in time, THEN it SHALL answer 401 `unauthorized` and call no model.
2. THE Intake_Endpoint SHALL accept a body with `hobby` (1 to 60 characters after trim), an optional `note` (a string of at most 800 characters after trim) and an optional `language`. IF `hobby` or `note` breaks these limits, THEN it SHALL answer 400 `invalid_input` and call no model. A missing or malformed `language` SHALL be read as `en`.
3. THE Intake_Endpoint SHALL allow at most 30 model calls per user per hour (decision 23). IF the user is over the limit, THEN it SHALL answer 429 `rate_limited` and call no model.
4. WHEN the request carries a User_Config key, THE Intake_Endpoint SHALL call that provider's Small_Model with that key. Otherwise it SHALL call the Small_Model of the Default_Config's provider with the Default_Config's key. The Small_Model ids SHALL be read from the server config, which SHALL have a default per provider (decision 32). IF neither config is usable, THEN it SHALL answer 503 `no_key`.
5. THE Intake_Endpoint SHALL make exactly 1 model call per request, with a structured answer and no retry, and SHALL stop it after 5 s with 504 `timeout` (AS9). The target for a normal call is under 2 s. The call SHALL run with extended thinking turned off and an output limit of 1200 tokens. WHERE the call uses a learner's own OpenAI key, it SHALL run with the lowest reasoning effort and an output limit of 2000 tokens (decision 37).
6. THE Intake_Endpoint SHALL pass the hobby and the Note to the model as data. Its prompt SHALL tell the model to ignore any instruction inside them and to return only an Intake_Profile.
7. WHEN the call succeeds, THE Intake_Endpoint SHALL answer 200 with an Intake_Profile that meets this contract:
   - `level` is `new`, `returning`, `regular` or null;
   - `goal` is null or one of the entries of `goalOptions`;
   - `avoid` and `taste` are lists of 0 to 5 strings of 1 to 40 characters;
   - `goalOptions` holds 2 to 4 Goal_Options, `knownOptions` holds 0 to 6 Options, `tasteOptions` holds 0 to 5 Options (decision 29);
   - every `id` is 1 to 40 characters of lowercase letters, digits and single hyphens, and is unique in its list;
   - every `label` has 1 to 40 characters and every `finishLine` has 1 to 60 characters (decision 24);
   - `mascotSet` is a Mascot_Set (decision 33).
8. THE Intake_Endpoint SHALL pass the model's answer through the Sanitizer and SHALL NOT reject an answer for a small slip (decision 29). The Sanitizer SHALL:
   - read a `level` that is not one of the three values as null;
   - drop an Option without a valid `id`, a `label` or, for a Goal_Option, a `finishLine`, and drop an Option whose `id` repeats an earlier one of its list;
   - shorten a `label` to 40 characters and a `finishLine` to 60;
   - cut `goalOptions` to 4, `knownOptions` to 6, `tasteOptions` to 5, and `avoid` and `taste` to 5 entries of at most 40 characters, dropping entries that are not text or are empty;
   - set `goal` to the entry of `goalOptions` with the same `id`, or to null when there is none;
   - read a `mascotSet` that is not a Mascot_Set as the default outfit;
   - return a failure only when the answer cannot be parsed as an object or fewer than 2 `goalOptions` survive. In that case THE Intake_Endpoint SHALL answer 502 `generation_failed` and return no part of the answer.

   The Sanitizer SHALL never throw, and its result SHALL always be a failure or an Intake_Profile that meets criterion 7.
9. IF the Note is empty after trim, THEN THE Intake_Endpoint SHALL return `level` null, `goal` null, and empty `avoid` and `taste`, whatever the model answered (AS10).
10. THE prompt SHALL tell the model to fill `level`, `goal`, `avoid` and `taste` only from what the learner wrote, to leave a field empty when the Note is vague about it, and never to guess (decision 4).
11. THE prompt SHALL tell the model that no entry of `goalOptions`, `knownOptions` or `tasteOptions` may match an entry of `avoid`.
12. THE prompt SHALL tell the model to write every label, every Finish_Line and every `avoid` and `taste` entry in the language of the request's Language_Code.
13. THE prompt SHALL tell the model to return `knownOptions` as 4 to 6 concrete beginner skills of this hobby, `goalOptions` as 4 different outcomes a learner of this hobby may want, with a detected goal as one of them, an empty `tasteOptions` unless taste shapes what the learner practices, as in food or crafts, and `mascotSet` as the closest Mascot_Set.
14. IF the model reports that the hobby is not a hobby, THEN THE Intake_Endpoint SHALL answer 422 `not_a_hobby` (decision 22).
15. THE Intake_Endpoint SHALL write no log line and no analytics or observability record that holds the Note, the hobby text or any text of the Intake_Profile. A log line holds only the error code, the stage, the provider and the model.
16. An intake call SHALL NOT count as a Billable_Generation and SHALL NOT change the hourly limit of the Tree_Route. A call over the limit of criterion 3 SHALL NOT change it either.

### Requirement 3: Running intake from the page

**User Story:** As a learner, I want "Build my path" to always lead to a path, so that a slow or broken intake never stops me.

#### Acceptance Criteria

1. WHEN the learner taps "Build my path" in the input state with a hobby, THE page SHALL send 1 request to the Intake_Endpoint with the hobby, the Note, the Language_Code, the Access_Token and, when the learner set one, the User_Config key and provider.
2. IF no Access_Token is available, THEN THE page SHALL send no intake request and SHALL show the session error of today.
3. WHILE the intake request runs, THE page SHALL show the button as busy, ignore further taps, keep the hobby and Note read only, show Wick's reading line and announce it in the status region.
4. THE page SHALL abort the intake request 5000 ms after it was sent.
5. WHEN the answer is a 200, THE page SHALL pass its body through the same Sanitizer and open the Panel with the result. A body the Sanitizer fails on SHALL be an Intake_Failure.
6. IF intake ends in an Intake_Failure, THEN THE page SHALL open no Panel, show no error for it, send `intake_failed` and start generation at once from the hobby alone, with no profile and the Start_Level `new`, exactly as a build works today (decision 11).
7. WHEN the learner leaves the page while intake runs, THE page SHALL abort the request and SHALL NOT start generation.

### Requirement 4: Panel and Chips

**User Story:** As a learner, I want to see what Pursio understood and remove what is wrong, so that the path is not built on a misreading.

#### Acceptance Criteria

1. THE Panel SHALL open under the inputs, inside the same card and on the same route, without a page change. The hobby and the Note SHALL stay visible above it (AS13), and Wick SHALL say "Got it. Anything to fix?" when at least 1 Chip is shown, else "A couple of quick questions." (AS1). From the moment the Panel opens until the path is ready, Wick SHALL wear the outfit of the profile's `mascotSet` (decision 33). On the ready screen Wick SHALL wear the outfit of the generated tree, as today.
2. WHILE the profile has at least 1 Detected_Field, THE Panel SHALL show the heading "Here's what I got" and one Chip per Detected_Field, in the order Level, Goal, Not for you, Taste. With no Detected_Field, the heading and the Chips SHALL NOT be shown.
3. Each Chip SHALL show a small uppercase tag ("Level", "Goal", "Not for you" or "Taste") followed by its value: the level label, the goal label, or the entries. A Chip of several entries SHALL list them all, separated by commas, in one Chip. The "Not for you" tag SHALL use the warning text color of the theme, as in the mockup.
4. Each Chip SHALL have a × button with the accessible name "Remove <field>" (for example "Remove goal"), a touch target of at least 44 px, and Enter and Space as keys.
5. WHEN the learner removes a Chip, THE Panel SHALL set that field to its empty value (level and goal to null, avoid and taste to an empty list), remove the Chip, select the questions again as in Requirement 5 and send no intake request. A removed Chip does not come back in this Panel.
6. WHEN a Chip is removed, focus SHALL move to the next Chip, else to the previous one, else to the first question.
7. WHEN the Panel opens, focus SHALL move to the heading of criterion 2 when it is shown, else to the first question (AS2, decision 19), and the status region SHALL announce that the Panel opened.
8. WHILE the Panel is open, THE page SHALL show exactly two actions, both inside the Panel: the primary button "Build my path" and the text button "Skip, just build it". The idea chips SHALL NOT be shown, and the line "You can change your goal later from the path." SHALL NOT be shown (AS11).
9. WHEN the learner edits the hobby or the Note while the Panel is open, THE page SHALL close the Panel, drop the profile and every selection, and return to the input state. The next "Build my path" SHALL run intake again.

### Requirement 5: Tap questions

**User Story:** As a learner, I want at most two quick questions about what is missing, so that the setup takes seconds.

#### Acceptance Criteria

1. THE Panel SHALL choose its questions with one rule, applied when it opens and after every Chip removal. It builds a list in this order and shows the first 2 entries:
   - the goal question, when `goal` is null;
   - the known skills question, unless `level` is `new` (decision 18) or `knownOptions` is empty;
   - the taste question, when `tasteOptions` is not empty and `taste` is empty.
2. THE goal question SHALL read "What does done look like?" and offer the 2 to 4 Goal_Options as a single select: tapping an Option selects it and clears the other, and tapping the selected Option clears it (decision 16).
3. THE known skills question SHALL read "What can you already do?" with the hint "these start as done", and offer every entry of `knownOptions` as a multi select.
4. THE taste question SHALL read "What do you like?" and offer every entry of `tasteOptions` as a multi select.
5. WHEN a question leaves the shown list, its selections SHALL be dropped. IF it is shown again, THEN it SHALL start with nothing selected.
6. Each question SHALL be a group with its text as accessible name. Each Option SHALL be a toggle button that reports pressed or not pressed, with a touch target of at least 44 px.

### Requirement 6: Build or skip

**User Story:** As a learner, I want to build with my answers or skip them, so that I am never stuck in the Panel.

#### Acceptance Criteria

1. WHEN the learner taps "Build my path" in the Panel, THE page SHALL make the Final_Profile from the fields of the remaining Chips and the selections of the shown questions: `goal` is the Chip's goal or the selected Goal_Option, `known` is the selected Known_Skills, and `taste` is the Chip's entries or the labels of the selected taste Options. It SHALL send `intake_answered`.
2. WHEN the learner taps "Skip, just build it", THE page SHALL make the Final_Profile from the fields of the remaining Chips only, with an empty `known`, SHALL ignore every selection and SHALL send `intake_skipped`.
3. After criterion 1 or 2, THE page SHALL close the Panel and start generation with the Final_Profile, showing the building steps of today.
4. WHILE generation is starting or running, further taps on either button SHALL do nothing.
5. THE tree request SHALL carry the hobby and the Final_Profile. A request after an Intake_Failure SHALL carry no profile and the level `new`. The Settings goal SHALL be sent as today.
6. WHEN the learner set a User_Config, intake and generation SHALL both use the learner's key: intake with the Small_Model, generation with the learner's chosen model (decision 23).

### Requirement 7: Tree_Route with a profile

**User Story:** As a learner, I want the server to build exactly for my answers, so that I never get someone else's path.

#### Acceptance Criteria

1. THE Tree_Route SHALL accept an optional `profile`. A request without one, or with null, SHALL behave exactly as today.
2. THE Tree_Route SHALL check a `profile` against the limits of Requirement 2, criterion 7 for `level`, `goal`, `avoid`, `taste` and `goalOptions` (2 to 4 entries, with `goal` null or one of them), and SHALL require `known` to be a list of 0 to 6 Options with unique ids. IF the profile breaks a limit, THEN it SHALL answer 400 `invalid_input` and call no model. The page only sends profiles that passed the Sanitizer, so this answer is for a changed request, not for a learner.
3. WHEN a profile is present, THE Tree_Route SHALL take the Start_Level from its Intake_Level and ignore the request's `level`: `new` and null give `new`, `returning` gives `some`, `regular` gives `serious` (decision 15).
4. WHEN the request has a Plain_Profile, THE Tree_Route SHALL read and write the tree cache as today, with the key of hobby, Start_Level, provider and model (decision 27).
5. WHEN the profile is not plain, THE Tree_Route SHALL NOT read the tree cache and SHALL NOT write the generated tree to it (decision 27).
6. THE hourly limit SHALL count each Billable_Generation as today, with or without a profile.
7. THE success response SHALL carry the tree, the model, the path id and the Stored_Profile, or null when none was stored.
8. THE Goal_Class SHALL be computed from the Settings goal as today. The profile's goal SHALL NOT change it (decision 20).

### Requirement 8: Generation follows the profile

**User Story:** As a learner, I want the path to start where I am and end where I want to get, so that it is my path and not a generic one.

#### Acceptance Criteria

1. THE generator SHALL receive the Final_Profile as data next to the hobby and the Start_Level. Its prompt SHALL tell the model to ignore any instruction inside the profile's texts.
2. THE Start_Level SHALL decide where the path starts and which section levels it uses, with the rules the generator has today for `new`, `some` and `serious`.
3. WHEN the profile has a goal, THE prompt SHALL ask for a Final_Milestone that is the Finish_Line and SHALL forbid a generic mastery ending. THE Tree_Loader SHALL require only that the Final_Milestone is a milestone, and SHALL NOT compare its title. THE Tree_Route SHALL then set the title of the Final_Milestone to the Finish_Line (decision 30). The 28 character rule for titles SHALL NOT apply to this Node (decision 24).
4. WHEN the profile has no goal, THE generator SHALL choose the ending as today.
5. WHEN `avoid` has entries, THE prompt SHALL forbid any Node, milestone or quest that matches one of them (AS4).
6. WHEN `taste` has entries, THE prompt SHALL tell the model to shape the quests by them while keeping the order in which the hobby is learned (AS4).
7. WHEN `known` has entries, THE prompt SHALL ask for exactly 1 Node per Known_Skill, with that skill's id as `knownOptionId` (decision 28), as the first Main_Nodes of the first Section, and for a null `knownOptionId` on every other Node (AS3).
8. THE Tree_Route SHALL repair the `knownOptionId` values of a generated tree and SHALL NOT reject a tree because of them (decision 31). It SHALL strip a `knownOptionId` that is not the id of a Known_Skill of the request, one that repeats an earlier Node's value in document order (the first is kept), one on a milestone or a side quest (AS14), and any beyond the first 6. A tree that has no Node for a Known_Skill SHALL be accepted. The match SHALL be by id only, never by title.
9. IF the profile has a goal and the last Node of the last Section is not a milestone, THEN the tree SHALL be rejected with a Validation_Error and generated once more with the reason, as other invalid trees are today. A second failure SHALL give `generation_failed`. No other rule of this requirement SHALL reject a tree.
10. `knownOptionId` SHALL be an optional field of a Node. A tree without it, such as every tree made before this spec, SHALL load as a tree with no Known_Node.

### Requirement 9: Known skills and the head start

**User Story:** As a learner who already knows some basics, I want credit for them, so that I do not start from zero.

#### Acceptance Criteria

1. THE Known_Nodes of a path SHALL be found by matching `knownOptionId` to the ids of the Stored_Profile's `known`, never by title. At most 6 SHALL count, the first 6 in document order.
2. Every reader of completion SHALL use Effective_Completed: Node states, unlocking, the Current_Node, the completion percent, section headers, profile statistics, and the current skill and completed count that Fresh reads (AS6). Known_Node ids SHALL NOT be written to the Progress_Row (decision 17).
3. Hobby_XP SHALL be Head_Start_XP, plus 50 per completed Node that is not a Known_Node, plus 10 per ticked quest of a Node that is not a Known_Node, plus the daily bonus as today. Head_Start_XP counts toward the level as any other XP (decision 8).
4. A Known_Node SHALL give exactly 30 XP in every state of the Progress, including a Progress whose `completed` holds its id. It SHALL never give 50 or 80.
5. Head_Start_XP SHALL be the same on every device, after every reload and on the profile page, because it is computed from the Path_Row. No action of the learner SHALL add it a second time.
6. A Known_Node SHALL have no completion time, and SHALL NOT make the day of creation an active day for the Streak or the Week (AS5). No unlock or "+XP" animation SHALL play for a Known_Node.
7. WHEN the learner resets the progress of a path, in either reset mode, its Known_Nodes SHALL stay completed, its Head_Start_XP SHALL stay, and the ticks of its Refresher_Quests SHALL be cleared (decision 21). Undo SHALL work as today.
8. A path with a null profile, or with an empty `known`, SHALL have exactly the Node states and the Hobby_XP it has today.

### Requirement 10: Refresher_Quests

**User Story:** As a learner, I want to try the quests of a skill I said I know, so that I can check myself, without gaming XP.

#### Acceptance Criteria

1. WHEN the learner opens a Known_Node, THE detail view SHALL show it as completed, show its 3 quests as tickable, show the line "You already know this one. These quests are an optional refresher and give no XP." and SHALL NOT offer Mark_Complete.
2. WHEN the learner ticks or unticks a Refresher_Quest, the tick SHALL be saved with the Progress and shown after a reload.
3. A Refresher_Quest tick SHALL give 0 XP.
4. A Refresher_Quest SHALL count for nothing else (decision 25): it is never part of a Daily_Pick, never grants a Daily_Bonus, gets no Tick_Time, does not make a day active for the Streak, the Week or the weekly reward, and is not listed on the Quests_Page.

### Requirement 11: Stored_Profile

**User Story:** As the product owner, I want the profile kept with the path, so that a later "change goal" feature can rebuild the rest of the path.

#### Acceptance Criteria

1. THE migrations SHALL add `paths.profile`, a nullable `jsonb` column. Existing rows SHALL have null. The existing row level security of `paths` SHALL cover it.
2. THE save function SHALL write the path and its profile in one transaction. WHEN a path with the same Hobby_Id exists, it SHALL replace the profile with the new one, or with null.
3. THE Stored_Profile SHALL hold `level` (the Intake_Level), `goal`, `avoid`, `taste`, `known` and `goalOptions`. Its `known` SHALL hold only the Known_Skills that have a Node in the saved tree after the repair of Requirement 8, criterion 8, in the order the learner's profile had them (decision 31). It SHALL NOT hold the Note, `knownOptions`, `tasteOptions` or `mascotSet` (AS7).
4. A path built without a profile (an Intake_Failure) SHALL have a null `profile`. A path built with a Plain_Profile SHALL store that profile.
5. THE Client SHALL load the profile with the Path_Row. IF a stored profile does not match the Stored_Profile shape, THEN it SHALL be read as null and the path SHALL load as a path without a profile.
6. A path made before this spec SHALL keep its tree, its progress, its XP and its `paths.level`, and SHALL show no Finish_Line and no head start.
7. WHEN the learner builds a hobby that already has a path, the path SHALL be replaced and its progress reset, as today. The new Stored_Profile and its Head_Start_XP SHALL apply, and nothing of the old profile SHALL remain.
8. Every store of a path SHALL keep the Stored_Profile next to the tree: the Path_Row, a path kept in local storage, a path put back by Undo, and a path uploaded by the legacy import. A path read back from any of them SHALL have the same Known_Nodes and the same Head_Start_XP as when it was saved (decision 36).

### Requirement 12: Ready screen

**User Story:** As a learner, I want to see my finish line and my head start as soon as the path is ready, so that I know it listened.

#### Acceptance Criteria

1. WHEN the Stored_Profile has a goal, THE ready card SHALL show, under the three counts, a block with a flag icon, the label "Your finish line" and the Finish_Line.
2. WHEN the path has at least 1 Known_Node, THE ready card SHALL show a block with the heading "You start with a head start", a badge "+<Head_Start_XP> XP", the labels of its Known_Skills, each with a check mark, and the line "Marked done on your path. Their quests stay open if you want a refresher." A Known_Skill the learner selected but the tree has no Node for SHALL NOT be listed or counted (decision 31).
3. WHEN neither applies, or the profile is null, THE ready card SHALL look exactly as today.
4. "First up" SHALL name the Current_Node computed with Effective_Completed, so it is never a Known_Node. The counts of skills, sections and quests SHALL stay as today and include Known_Nodes.

### Requirement 13: Failed generation and retry

**User Story:** As a learner, I want a retry to keep my answers, so that I do not go through the Panel twice.

#### Acceptance Criteria

1. IF generation or the save fails after the Panel, THEN THE page SHALL show the error state of today and keep the hobby, the Note and the Final_Profile in memory.
2. WHEN the learner taps "Try again" and the Normalized_Hobby is the one the Final_Profile was made for, THE page SHALL start generation with the same Final_Profile, run no intake, open no Panel and send no intake event.
3. WHEN the learner taps "Try again" after changing the hobby, THE page SHALL drop the Final_Profile, return to the input state with the new hobby and the Note, and send no request. The next "Build my path" SHALL run intake.
4. IF the device is offline, THEN intake SHALL end in an Intake_Failure and generation SHALL fail with the error state of today, with the hobby and the Note kept.

### Requirement 14: Analytics

**User Story:** As the product owner, I want to see how the Panel is used, without ever collecting what learners write.

#### Acceptance Criteria

1. Every event of this requirement SHALL be sent through `track()`.
2. WHEN the Panel opens, THE page SHALL send `intake_shown` once, with `detected_fields` (the names of the Detected_Fields, from `level`, `goal`, `avoid`, `taste`, in that order) and `questions_count` (0, 1 or 2).
3. WHEN a Chip is removed, THE page SHALL send `intake_chip_removed` with `field`, one of `level`, `goal`, `avoid`, `taste`.
4. WHEN the learner builds from the Panel, THE page SHALL send `intake_answered` with `goal_set` (whether the Final_Profile has a goal), `known_count` (0 to 6) and `taste_count` (the number of selected taste Options, 0 to 5).
5. WHEN the learner skips, THE page SHALL send `intake_skipped` with no property.
6. WHEN intake ends in an Intake_Failure, THE page SHALL send `intake_failed` once, with no property.
7. No event SHALL carry the Note, the hobby, a Chip value, an Option label or id, or a Finish_Line. Properties are field names, counts and booleans only (decision 12).
8. A failing or blocked analytics client SHALL NOT change any step of the flow.
9. THE existing event `skill_path_generated` SHALL stay, with `start_level` as the Start_Level of Requirement 7, criterion 3.

### Requirement 15: Copy and accessibility

**User Story:** As a learner, I want the new parts to read and work like the rest of Pursio.

#### Acceptance Criteria

1. No fixed visible copy added by this spec SHALL contain a hyphen, an en dash or an em dash (decision 13).
2. THE fixed copy SHALL be (AS1):

   | Place | Copy |
   |---|---|
   | Note label | Tell Wick more · optional |
   | Note placeholder (AS1) | Where you are now, where you want to get, what you like or want to skip. |
   | Note counter (AS1) | <n> left |
   | Wick while intake runs (AS1) | Give me a second… |
   | Wick with the Panel open | Got it. Anything to fix? · with no Chip (AS1): A couple of quick questions. |
   | Chips heading | Here's what I got |
   | Chip tags | Level · Goal · Not for you · Taste |
   | Level labels | New to it · Coming back to it · Doing it regularly |
   | Questions | What does done look like? · What can you already do? (hint: these start as done) · What do you like? |
   | Buttons | Build my path · Skip, just build it |
   | Ready card, finish line | Your finish line |
   | Ready card, head start | You start with a head start · +<n> XP · Marked done on your path. Their quests stay open if you want a refresher. |
   | Known skill on the path | You already know this one. These quests are an optional refresher and give no XP. |

3. Fixed copy SHALL stay in English, as the rest of the page. Text from the model SHALL be in the learner's language (Requirement 2, criterion 12).
4. Every new control SHALL use theme tokens only, have a touch target of at least 44 px, a visible focus style and a text contrast of at least 4.5:1 in every theme.
5. Every step SHALL work with the keyboard alone, and every state change (reading, Panel opened, building, ready, error) SHALL be announced in the status region.
6. WHILE the learner prefers reduced motion, the Panel SHALL open and close without animation.

### Requirement 16: Verification

**User Story:** As a developer, I want tests for the intake rules, so that regressions are caught.

#### Acceptance Criteria

1. THE test suite SHALL include a property-based test (fast-check, at least 100 cases) of the question rule of Requirement 5, criterion 1 over generated profiles and sequences of Chip removals, asserting: never more than 2 questions; the order goal, known skills, taste; no goal question while `goal` is set; no taste question while `taste` has entries or `tasteOptions` is empty; no known skills question while `level` is `new` or `knownOptions` is empty.
2. THE test suite SHALL include a property-based test of Chip removal: removing a Chip sets exactly that field to its empty value and leaves the others unchanged; the question of that field is absent before the removal and allowed only after it; a removal never adds a Chip.
3. THE test suite SHALL include a property-based test of Head_Start_XP over generated trees, profiles and Progress values: it is exactly 30 × min(Known_Nodes, 6); it is the same for every Progress, including one that lists Known_Node ids as completed, one with every Refresher_Quest ticked, and one after a reset; Hobby_XP minus Head_Start_XP equals today's XP of the Nodes that are not Known_Nodes; and a path with no Known_Node has today's Hobby_XP.
4. THE test suite SHALL include a property-based test of the Final_Milestone: for every generated profile with a goal and every generated tree whose last Node is a milestone, with any title, the tree is accepted and the saved tree's Final_Milestone has exactly the Finish_Line as title; a tree whose last Node is not a milestone is rejected; a profile without a goal leaves every title unchanged.
5. THE test suite SHALL include a property-based test of the `knownOptionId` repair over generated trees and profiles: the repair never rejects and never throws; afterwards every `knownOptionId` is the id of a Known_Skill of the request, none appears twice, none is on a milestone or a side quest, and at most 6 remain; the first Node of a repeated id keeps it; the Stored_Profile's `known` equals exactly the Known_Skills that have a Node, in profile order; Head_Start_XP is 30 × that number; renaming Nodes changes none of this; and a Node whose title equals a Known_Skill label but whose `knownOptionId` is null is not a Known_Node.
6. THE test suite SHALL verify the Sanitizer by example at each limit (1, 2, 4 and 5 goal options; 0, 6 and 7 known options; 5 and 6 taste options; a 40 and a 41 character label; a 60 and a 61 character Finish_Line; a repeated id; an Option without a label; a goal that is not one of the options; an unknown `mascotSet`), the empty Note rule of criterion 9, and each error answer of Requirement 2 (401, 400, 429, 503, 504, 502, 422), with 0 model calls where the criteria say so.
7. THE test suite SHALL verify that an intake call and a refused intake call leave the Tree_Route's hourly limit unchanged, and that the 31st intake call of a user within an hour is refused.
8. THE test suite SHALL verify the page flow with a fake Intake_Endpoint: a valid answer opens the Panel; each kind of Intake_Failure starts generation with no profile and sends `intake_failed` once; the request is aborted at 5000 ms with a fake clock; a second tap sends no second request; editing the hobby or Note closes the Panel; the handoff runs intake once and falls back to a direct build.
9. THE test suite SHALL verify the Final_Profile for "Build my path" and for "Skip, just build it", including that Skip ignores selections, and the retry rules of Requirement 13.
10. THE test suite SHALL verify the Tree_Route: the level mapping for the 4 Intake_Level values; a Plain_Profile and a missing profile read and write the cache; every profile that is not plain (a goal, an avoid entry, a taste entry or a known skill, each alone) reads and writes nothing in the cache; an invalid profile gives 400 with 0 model calls; the Goal_Class does not depend on the profile.
11. THE test suite SHALL verify Effective_Completed in the Progress_Engine: Known_Nodes are completed, the Current_Node is the first Main_Node that is not known, the percent counts them, and a reset keeps them. It SHALL verify that a Refresher_Quest tick is saved, gives 0 XP, grants no Daily_Bonus, gets no Tick_Time and is in no Daily_Pick.
12. THE test suite SHALL verify the Stored_Profile: the save writes it, a replaced path gets the new one or null, a malformed stored value is read as null, and a path made before this spec loads unchanged with the same XP.
13. THE test suite SHALL verify each analytics event with its exact property names and value types, and that no property value equals or contains the Note, the hobby, a label or the Finish_Line of the test case.
14. THE test suite SHALL verify, by reading the copy constants of Requirement 15, criterion 2, that none contains a hyphen, an en dash or an em dash.
15. THE existing tests of `new-hobby-page`, `ai-skill-tree-generation`, `skill-path-ui`, `quests-page` and `reset-progress` that this spec does not replace SHALL keep passing. Tests of the removed level picker SHALL be removed or changed to the rules above.
16. THE manual test matrix, with at least one row per confirmed scenario, SHALL be part of [design.md](design.md). It covers what the suite cannot: the avoid and taste rules on real generated paths (AS4), the 2 s target, and the layout against the four mockups.
17. THE test suite SHALL include a property-based test of the Sanitizer over arbitrary JSON values and over valid profiles with random damage (extra entries, missing fields, wrong types, long strings, repeated ids): it never throws; it returns either a failure or an Intake_Profile that meets Requirement 2, criterion 7; it returns a failure only when the input is not an object or fewer than 2 Goal_Options survive; and sanitizing its own result changes nothing (decision 29).
18. THE test suite SHALL include a property-based test of reading a saved path back: for any tree and Stored_Profile the Tree_Route can save, writing the path to a Path_Row and to local storage and reading each back gives the same Known_Nodes and the same Head_Start_XP, also after a second write and read and after the legacy import; and a record whose profile is missing or unreadable reads as a path with no Known_Node (decision 36).
19. THE test suite SHALL verify the request the Intake_Endpoint sends to each provider: thinking turned off and 1200 output tokens for Anthropic, the lowest reasoning effort and 2000 output tokens for OpenAI. A latency check of 20 intake calls against the 2 s target SHALL be run by hand before the Panel is built (decisions 37, 38).
