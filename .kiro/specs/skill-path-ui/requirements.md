# Requirements Document

## Introduction

This feature renders a hard-coded sample skill tree for bouldering as Pursio's core path view: a vertical, gently winding trail of skill nodes split into sections, with side quests branching off and a milestone closing each section. The user can open a node, tick its quests, mark it complete and see the next skills unlock. Progress is saved in the browser.

There is no AI and no backend in this feature. The skill tree comes from a JSON file, is checked by a schema and a graph validator, laid out with elkjs and drawn with SVG and Vue components. The visual target is the reference design in `docs/design/Path-Mobile` (390px mobile artboard) and `docs/design/Path-Desktop` (desktop artboard with sidebar and side panel). Those files are references only; the implementation is rebuilt in Vue and Tailwind with Pursio theme tokens.

Approved new dependencies, pinned to exact versions: `zod`, `elkjs`, `fast-check` and `vitest`. No other new dependency is in scope.

### Static placeholders

The following parts of the reference design are shown with fixed sample values and have no behavior in this feature:

- Day streak count (shown as 6) and the "This week" card with Monday–Sunday day dots and the "3 of 4 sessions" text.
- The "Your hobbies" list in the desktop sidebar (Bouldering active, Film photography with a fixed progress bar) and the "+ Add a hobby" button.
- The hobby switcher button in the mobile header.
- Navigation items other than "Path" (Fresh feed, Quests, Profile) in the desktop sidebar and the mobile bottom navigation.
- The "Fresh this week" content cards in the node detail, which use fixed sample entries per node.
- Wick, the mascot, is not rendered. The skill tree only carries the `mascot.set` value.

### Out of scope

AI generation, any server route or Supabase access, accounts, multiple hobbies with real data, real fresh content, real streak tracking, and Wick rendering.

## Glossary

- **Skill_Tree**: The data object describing one hobby's path: `hobby` (string), `sections` (ordered list of Sections) and `mascot` (object with `set`, a string).
- **Section**: An ordered group of Nodes with a `title` and a `level` of `beginner`, `intermediate` or `advanced`.
- **Node**: One skill in a Section with `id`, `title`, `description`, `prerequisites` (list of Node ids), `optional` (boolean), `milestone` (boolean) and `quests` (exactly 3 strings).
- **Main_Node**: A Node with `optional` set to false.
- **Side_Quest_Node**: A Node with `optional` set to true.
- **Milestone_Node**: A Node with `milestone` set to true.
- **Sample_Tree**: The Skill_Tree stored in `data/sample-bouldering.json`.
- **Tree_Schema**: The zod schema that checks the shape of a Skill_Tree.
- **Tree_Validator**: The module that checks the graph rules of a Skill_Tree that passed the Tree_Schema: unique ids, existing prerequisites and no cycles.
- **Validation_Error**: A typed result entry from the Tree_Validator or the Tree_Schema naming the rule broken and the Node ids or field path involved.
- **Progress**: The user's state for one Skill_Tree: the set of completed Node ids and, per Node, which of its 3 quests are checked.
- **Progress_Store**: The module that reads and writes Progress in the browser's localStorage.
- **Progress_Engine**: The pure logic that derives each Node's Node_State from a Skill_Tree and a Progress.
- **Available_Node**: A Node that is not completed and whose prerequisites are all completed.
- **Current_Node**: The first Available_Node that is a Main_Node, in Section order and then Node order within the Section. At most one Current_Node exists.
- **Node_State**: The display state of a Node, one of `locked`, `current`, `completed`, `side_quest` or `milestone`.
- **Path_Layout**: The module that computes Node positions with elkjs (layered algorithm, top-to-bottom direction) and maps them onto the winding vertical path.
- **Winding_Offsets**: The repeating list of horizontal offsets from the path's center line used to make the trail wind: `0, -60, -90, -60` px on mobile and `0, -90, -135, -90` px on desktop.
- **Path_View**: The Vue page and components that draw the Path_Layout as SVG and HTML and handle taps on Nodes.
- **Trail**: The dotted line of dots drawn between connected Nodes in the Path_View.
- **Trail_Segment**: The dots between one Node and one of the Nodes that lists it as a prerequisite.
- **Section_Header**: The heading shown before a Section's Nodes, in either Banner style or Divider style.
- **Active_Section**: The Section that contains the Current_Node, or the last Section when every Main_Node is completed.
- **Progress_Ring**: The ring around the Current_Node that fills in proportion to its checked quests.
- **Next_Up_Tag**: The "NEXT UP" label shown above the Current_Node.
- **Node_Detail**: The view showing the selected Node's details. On mobile it is the Bottom_Sheet; on desktop it is the Side_Panel.
- **Bottom_Sheet**: The panel that slides up from the bottom of the screen over a dimmed overlay on mobile.
- **Side_Panel**: The fixed right-hand column showing the selected Node on desktop.
- **Unlock_Moment**: The feedback shown after a Node is completed: the newly unlocked Nodes animate and a card shows "+50 XP" and the next skill.
- **Header_Stats**: The streak count, level, XP bar and XP text shown at the top of the Path_View.
- **Mobile_Viewport**: A viewport narrower than 1024 CSS px. The primary design width is 390 CSS px.
- **Desktop_Viewport**: A viewport 1024 CSS px wide or wider.
- **Theme_Token**: A `--pursio-*` CSS variable defined for every theme in `app/assets/css/themes.css` and mapped to a Tailwind utility in `app/assets/css/main.css`.
- **Reduced_Motion**: The user's `prefers-reduced-motion: reduce` setting.

## Requirements

### Requirement 1: Skill tree types and schema

**User Story:** As a developer, I want typed skill tree data checked by a schema, so that the path view and later AI output share one trusted shape.

#### Acceptance Criteria

1. THE Tree_Schema SHALL accept an object with a `hobby` string, a `sections` list of at least 1 Section and a `mascot` object with a `set` string. Every string named in Criteria 1 to 3 must contain at least one non-whitespace character.
2. THE Tree_Schema SHALL accept a Section only when the Section has a `title` string with at least one non-whitespace character, a `level` equal to exactly one of `beginner`, `intermediate` or `advanced`, and a `nodes` list of at least 1 Node.
3. THE Tree_Schema SHALL accept a Node only when the Node has `id`, `title` and `description` strings with at least one non-whitespace character, a `prerequisites` list of strings (an empty list is allowed), an `optional` boolean, a `milestone` boolean and a `quests` list of exactly 3 strings with at least one non-whitespace character each.
4. WHEN input data matches the Tree_Schema, THE Tree_Schema SHALL return a success result containing the parsed Skill_Tree, without throwing an exception.
5. IF input data does not match the Tree_Schema, including input that is not an object (null, a list, a string or a number), THEN THE Tree_Schema SHALL return a failure result without throwing an exception, with one Validation_Error for every mismatched value found.
6. IF input data does not match the Tree_Schema, THEN each Validation_Error SHALL give the field path from the root to the mismatched value as property names and list indices (for example `sections`, index 0, `nodes`, index 2, `quests`), with an empty path for a mismatched root value.
7. WHEN input data contains object keys not listed in Criteria 1 to 3, THE Tree_Schema SHALL leave those keys out of the parsed Skill_Tree and SHALL NOT report them as Validation_Errors.
8. THE Tree_Schema SHALL check only the shape of a Skill_Tree and SHALL NOT report duplicate ids, unknown prerequisite ids or cycles, which belong to the Tree_Validator.
9. THE Skill_Tree TypeScript types SHALL live in `shared/types/` and SHALL be inferred from or checked against the Tree_Schema, so that `yarn typecheck` fails whenever a field is added to, removed from or retyped in only one of them.
10. FOR ALL Skill_Tree values accepted by the Tree_Schema, serializing the value to JSON and parsing the JSON with the Tree_Schema SHALL return a success result deeply equal to the original value (round-trip property).

### Requirement 2: Skill tree graph validation

**User Story:** As a developer, I want the skill tree checked for broken links and loops, so that the path can always be unlocked from start to finish.

#### Acceptance Criteria

1. IF two or more Nodes in a Skill_Tree share the same `id`, THEN THE Tree_Validator SHALL return exactly one Validation_Error of kind `duplicate_id` for each repeated id, naming that id, however many times the id occurs. Nodes are compared across all Sections.
2. IF a Node lists a prerequisite id that matches no Node `id` in any Section of the Skill_Tree, THEN THE Tree_Validator SHALL return exactly one Validation_Error of kind `missing_prerequisite` for each (Node id, unknown prerequisite id) pair, naming both ids.
3. IF the prerequisites of a Skill_Tree form a cycle, including a Node that lists its own `id` as a prerequisite, THEN THE Tree_Validator SHALL return at least one Validation_Error of kind `cycle`. Each `cycle` error SHALL name the Node ids of one cycle, each id once, ordered so that each Node is a prerequisite of the next and the last Node is a prerequisite of the first.
4. WHEN the Tree_Validator checks for cycles, THE Tree_Validator SHALL ignore prerequisite ids that match no Node, so that a missing prerequisite on its own produces no `cycle` error.
5. IF a Skill_Tree breaks more than one graph rule, THEN THE Tree_Validator SHALL return every Validation_Error for every broken rule in a single result. The `duplicate_id` errors SHALL come first, then `missing_prerequisite` errors, then `cycle` errors. Within each kind, errors SHALL be ordered by Section order and then by Node order of the first Node they name.
6. WHEN a Skill_Tree has unique ids, only existing prerequisites and no cycles, THE Tree_Validator SHALL return an empty list of Validation_Errors. Prerequisites that point to Nodes in an earlier or later Section count as existing prerequisites.
7. FOR ALL generated acyclic Skill_Trees with 1 to 3 Sections, 1 to 15 Nodes per Section, unique ids and existing prerequisites, THE Tree_Validator SHALL return an empty list of Validation_Errors (property).
8. FOR ALL generated valid Skill_Trees with at least 2 Nodes, setting one Node's `id` equal to another Node's `id` SHALL make the Tree_Validator return a `duplicate_id` error naming that id (property).
9. FOR ALL generated valid Skill_Trees, adding to any Node a prerequisite id absent from the Skill_Tree SHALL make the Tree_Validator return a `missing_prerequisite` error naming that Node id and the absent id (property).
10. FOR ALL generated valid Skill_Trees, adding a prerequisite edge from a Node to one of its descendants, or to itself, SHALL make the Tree_Validator return a `cycle` error whose Node ids include both ends of the added edge (property).
11. THE Tree_Validator SHALL be a pure function of the Skill_Tree. It SHALL return deeply equal Validation_Error lists, in the same order, for deeply equal inputs, and SHALL leave the input Skill_Tree unmodified.

### Requirement 3: Sample bouldering data

**User Story:** As a demo viewer, I want a realistic bouldering path, so that the path view shows every node state in the first seconds.

#### Acceptance Criteria

1. THE Sample_Tree SHALL be stored at `data/sample-bouldering.json` in the Skill_Tree shape, with `hobby` set to "Bouldering" and `mascot.set` set to "bouldering".
2. THE Sample_Tree SHALL contain exactly 2 Sections in this order: Section 1 titled "First sessions" at level `beginner`, and Section 2 titled "Technique" at level `intermediate`.
3. THE Sample_Tree SHALL contain exactly 13 Nodes. Section 1 SHALL hold 8 Nodes in this order: Gear basics, Reading grades, Falling safely, Warm-up routine, Footwork basics, Body positioning, Resting on the wall, First V2. Section 2 SHALL hold 5 Nodes in this order: Flagging, Heel hooks, Toe hooks, Reading a route, First V4.
4. THE Sample_Tree SHALL contain exactly 1 Side_Quest_Node, "Falling safely". Its only prerequisite SHALL be "Reading grades", and no other Node SHALL list "Falling safely" as a prerequisite.
5. THE Sample_Tree SHALL contain exactly 1 Milestone_Node per Section, placed as the last Node of that Section: "First V2" in Section 1 and "First V4" in Section 2. Both Milestone_Nodes SHALL be Main_Nodes.
6. THE Sample_Tree SHALL give "Gear basics" an empty `prerequisites` list. Every other Main_Node SHALL list exactly one prerequisite: the Main_Node just before it in Section order and then Node order. As a result, "Flagging" lists "First V2" as its only prerequisite.
7. THE Sample_Tree SHALL pass both the Tree_Schema and the Tree_Validator with zero Validation_Errors, and an automated test run by `yarn test` SHALL check this.
8. IF the Sample_Tree fails the Tree_Schema or the Tree_Validator at load time, THEN THE Path_View SHALL show an error message naming the first Validation_Error and SHALL render no Nodes, Trail or Section_Headers. Tree_Schema errors count before Tree_Validator errors, and the Tree_Validator does not run when the Tree_Schema fails.

### Requirement 4: Node state derivation and unlocking

**User Story:** As a learner, I want skills to unlock when their prerequisites are done, so that I always know what to do next.

#### Acceptance Criteria

1. THE Progress_Engine SHALL assign each Node exactly one Node_State by applying the following rules in order and using the first rule that matches: (a) `completed` if the Node id is in the Progress completed set; (b) `current` if the Node is the Current_Node; (c) `side_quest` if the Node is a Side_Quest_Node and an Available_Node; (d) `milestone` if the Node is a Milestone_Node; (e) `locked` otherwise.
2. THE Progress_Engine SHALL select as the Current_Node the first Main_Node that is an Available_Node, scanning Sections in Skill_Tree order and Nodes in their order within each Section, and SHALL select no Current_Node when no Main_Node is an Available_Node.
3. THE Progress_Engine SHALL treat a Node with an empty `prerequisites` list and an id absent from the Progress completed set as an Available_Node.
4. THE Progress_Engine SHALL never assign `side_quest` to a Side_Quest_Node that has at least one prerequisite outside the Progress completed set; such a Side_Quest_Node SHALL receive `locked`.
5. THE Progress_Engine SHALL never assign `current` to a Side_Quest_Node.
6. WHEN an Available_Node is marked complete, THE Progress_Engine SHALL add its id to the Progress completed set and SHALL return Node_States in which every Node whose prerequisites are now all in the completed set and whose own id is not in it is an Available_Node.
7. WHILE a Node has at least one prerequisite whose id is not in the Progress completed set, THE Progress_Engine SHALL keep that Node out of the Available_Node set.
8. FOR ALL valid Skill_Trees and all Progress values whose completed set contains only Node ids from that Skill_Tree, THE Progress_Engine SHALL assign exactly one Node_State to every Node and SHALL assign `current` to at most one Node (property).
9. FOR ALL valid Skill_Trees and all Progress values whose completed set contains only Node ids from that Skill_Tree, every Node in state `current` or `side_quest` SHALL have all of its prerequisites in the Progress completed set (property).
10. FOR ALL valid Skill_Trees and all Progress values, marking a Node complete whose id is already in the Progress completed set SHALL return a Progress equal to the input Progress (idempotence property).
11. FOR ALL valid Skill_Trees in which no Main_Node has a Side_Quest_Node among its direct or indirect prerequisites, starting from an empty Progress and marking the Current_Node complete once per step SHALL put every Main_Node in the completed set after exactly as many steps as there are Main_Nodes, and SHALL leave no Current_Node after the last step (property).
12. IF a Milestone_Node is the Current_Node, THEN THE Path_View SHALL draw that Node at the Milestone_Node size with the `gold` Theme_Token fill, the `gold-deep` bottom shadow and the trophy icon, in place of the `primary` fill, `primary-deep` shadow and star icon of Requirement 6.5.
13. IF the Progress_Engine is asked to mark complete a Node id that is absent from the Skill_Tree or belongs to a Node that is not an Available_Node, THEN THE Progress_Engine SHALL return the input Progress unchanged and SHALL report that the Node was not completed.

### Requirement 5: Path layout

**User Story:** As a learner, I want a vertical trail that gently winds, so that the path feels like a game map I am walking.

#### Acceptance Criteria

1. THE Path_Layout SHALL compute the ordering of Nodes with elkjs using the layered algorithm in the top-to-bottom direction, with the prerequisite links of the Skill_Tree as the graph edges.
2. THE Path_Layout SHALL place every Main_Node, including Milestone_Nodes, with its center at a horizontal offset from the center line equal to entry (i mod 4) of the Winding_Offsets for the current viewport class, where i is the Main_Node's 0-based index among all Main_Nodes in Section order and then Node order, and the center line is the horizontal center of the path column.
3. THE Path_Layout SHALL place each Main_Node's center lower than the center of the Main_Node before it in Section order and then Node order.
4. THE Path_Layout SHALL set the vertical distance between the centers of two consecutive Main_Nodes in the same Section to 112 px on Mobile_Viewport and 124 px on Desktop_Viewport.
5. THE Path_Layout SHALL place each Side_Quest_Node's center at +110 px from the center line on Mobile_Viewport and +170 px on Desktop_Viewport, and vertically at the midpoint between the center of its prerequisite and the center of the next Main_Node after that prerequisite in Section order.
6. THE Path_Layout SHALL give each Node a square bounding box with a side of 72 px on Mobile_Viewport and 80 px on Desktop_Viewport for Main_Nodes that are not Milestone_Nodes, 84 px and 92 px for Milestone_Nodes, and 64 px and 70 px for Side_Quest_Nodes.
7. THE Path_Layout SHALL add a vertical gap before the first Node of each Section after the first, equal to the height of that Section's Section_Header, so that no Node bounding box overlaps any Section_Header box.
8. FOR ALL valid Skill_Trees and both viewport classes, THE Path_Layout SHALL return exactly one position per Node and SHALL place every Node's center lower than the center of each of its prerequisites (property).
9. FOR ALL valid Skill_Trees and both viewport classes, THE Path_Layout SHALL return positions where no two Node bounding boxes overlap (property).
10. FOR ALL valid Skill_Trees, running the Path_Layout twice on the same Skill_Tree and viewport class SHALL return identical positions (determinism property).
11. WHILE the Path_Layout is computing, THE Path_View SHALL show a loading state in place of the path and SHALL show no Nodes.
12. IF the Path_Layout throws an error or returns no position for at least one Node, THEN THE Path_View SHALL show an error message indicating that the path could not be drawn in place of the path, and SHALL leave the saved Progress unchanged.
13. WHEN the viewport crosses the 1024 CSS px boundary between Mobile_Viewport and Desktop_Viewport, THE Path_View SHALL recompute the Path_Layout with the values for the new viewport class and redraw the path without reloading the page.

### Requirement 6: Path rendering

**User Story:** As a learner, I want each skill's state to be clear at a glance, so that I can see what I have done and what comes next.

#### Acceptance Criteria

1. THE Path_View SHALL draw one Trail_Segment for each pair of a Node and a Node that lists it as a prerequisite, including the branch to each Side_Quest_Node. Each Trail_Segment SHALL be exactly 3 circular dots placed at 28%, 50% and 72% of the straight line from the prerequisite Node's center to the dependent Node's center, with a diameter of 8 px on Mobile_Viewport and 10 px on Desktop_Viewport. A Trail_Segment whose line crosses a Section_Header band SHALL have no dots, so the trail stops at the Section_Header.
2. WHILE both Nodes of a Trail_Segment are in state `completed`, THE Path_View SHALL draw that Trail_Segment's dots in the `done` Theme_Token color.
3. WHILE at least one Node of a Trail_Segment is not in state `completed`, THE Path_View SHALL draw that Trail_Segment's dots in the `trail` Theme_Token color.
4. THE Path_View SHALL draw every Node in state `completed`, including completed Side_Quest_Nodes and Milestone_Nodes, with the `done` fill, a solid 6 px `done-deep` bottom shadow and a check icon, at the size Path_Layout assigns to the Node's type.
5. THE Path_View SHALL draw the Node in state `current` that is not a Milestone_Node with the `primary` fill, a solid 6 px `primary-deep` bottom shadow, a star icon, the Progress_Ring around the Node and the Next_Up_Tag above the Node.
6. THE Progress_Ring SHALL fill a share of its circumference equal to the Current_Node's checked quest count divided by 3: no fill at 0 checked, one third at 1, two thirds at 2 and the full circle at 3.
7. THE Path_View SHALL draw every Node in state `locked` with the `locked` fill, a solid 6 px `locked-deep` bottom shadow and a lock icon.
8. THE Path_View SHALL draw every Node in state `side_quest` with the `surface` fill, a 3 px dashed `trail` outline, a solid 6 px `line` bottom shadow and a compass icon.
9. THE Path_View SHALL draw every Node in state `milestone` at the Milestone_Node size with the `locked` fill, a solid 6 px `locked-deep` bottom shadow and a trophy icon.
10. THE Path_View SHALL shape every Node with the `radius-node` Theme_Token.
11. THE Path_View SHALL show a label beside each Main_Node and below each Side_Quest_Node containing the Node title and a status line chosen by Node_State: "Done" for `completed`, "In progress · N/3" for `current` where N is the checked quest count from 0 to 3, "Side quest" for `side_quest`, "Milestone" for `milestone` and "Locked" for `locked`.
12. THE Path_View SHALL draw the titles of Nodes in state `locked` in the `muted` color and the titles of Nodes in every other Node_State in the `ink` color.
13. THE Path_View SHALL draw each Node as a button whose accessible name is the Node title followed by the status line from criterion 11, separated by a comma, and SHALL hide the Trail dots and Node icons from assistive technology.

### Requirement 7: Section headers

**User Story:** As a learner, I want headers between sections, so that I can see which stage of the hobby I am in.

#### Acceptance Criteria

1. THE Path_View SHALL show exactly one Section_Header before the first Node of each Section, including the first Section. Each Section_Header SHALL contain an eyebrow with the text "SECTION N · LEVEL" and the Section title. N is the Section's 1-based position in the Skill_Tree `sections` list. LEVEL is the Section's `level` value in uppercase ("BEGINNER", "INTERMEDIATE" or "ADVANCED").
2. THE Path_View SHALL draw the Active_Section's Section_Header in Banner style, and SHALL draw exactly one Section_Header in Banner style at any time. Banner style means a `banner` fill, the Section title in `banner-ink`, the eyebrow in `banner-muted`, a `banner-deep` solid bottom shadow and the count "X/Y skills". X is the number of completed Main_Nodes in that Section. Y is the number of Main_Nodes in that Section. Milestone_Nodes count as Main_Nodes and Side_Quest_Nodes are excluded, so 0 ≤ X ≤ Y.
3. THE Path_View SHALL draw every Section_Header other than the Active_Section's in Divider style. Divider style means no fill and no shadow on the page background, the eyebrow in `muted`, the Section title in `ink`, and no "X/Y skills" count.
4. WHILE the Milestone_Node of the Section directly before a Section is not completed, THE Path_View SHALL show "Reach <milestone title> to unlock" with a lock icon in that Section's Divider-style Section_Header. <milestone title> is the title of that preceding Section's Milestone_Node.
5. IF the Section directly before a Section has no Milestone_Node, or that Milestone_Node is completed, THEN THE Path_View SHALL show no "Reach … to unlock" text and no lock icon in that Section's Section_Header.
6. WHEN a Node completion changes the Active_Section, THE Path_View SHALL redraw the newly active Section's Section_Header in Banner style and the previously active Section's Section_Header in Divider style. The redraw SHALL happen in the same update that changes the Node_States, without a page reload.
7. WHEN a Main_Node in the Active_Section is completed, THE Path_View SHALL increase X in that Section's "X/Y skills" count by 1 in the same update that changes the Node_States.

### Requirement 8: Node detail

**User Story:** As a learner, I want to open a skill and see its quests, so that I know exactly what to practice.

#### Acceptance Criteria

1. WHEN the user taps any Node on Mobile_Viewport, THE Path_View SHALL open the Bottom_Sheet for that Node over a dimmed `overlay` backdrop that covers the rest of the viewport.
2. WHILE the viewport is a Desktop_Viewport, THE Path_View SHALL show the Side_Panel for the selected Node. When no Node has been selected, the selected Node is the Current_Node, or the last Node of the last Section if no Current_Node exists.
3. WHEN the user clicks a Node on Desktop_Viewport, THE Side_Panel SHALL show that Node's details in place of the previously selected Node's details.
4. THE Node_Detail SHALL show a state chip, the Node title and the Node description. The chip text is "COMPLETED" for `completed`, "IN PROGRESS" for `current`, "SIDE QUEST" for `side_quest`, "MILESTONE" for `milestone` and "LOCKED" for `locked`.
5. WHILE the viewport is a Desktop_Viewport, THE Side_Panel SHALL show the position text "Section N · Skill M" next to the state chip. N is the 1-based index of the Node's Section in the Skill_Tree, and M is the 1-based index of the Node within that Section's `nodes` list.
6. WHILE the selected Node is not `locked`, THE Node_Detail SHALL show the header "QUESTS · N OF 3", where N is the number of the Node's checked quests (0 to 3), and SHALL show the Node's 3 quests as checkboxes in the order they appear in `quests`.
7. WHEN the user toggles a quest checkbox, THE Node_Detail SHALL flip that quest's checked state in the Progress and update the checkbox, the header count N and, if the Node is the Current_Node, the Progress_Ring, all within one animation frame.
8. THE Node_Detail SHALL draw a checked quest with a `done` filled box and its text struck through in the `muted` color, and SHALL draw an unchecked quest with an empty box and its text not struck through in the `ink` color.
9. WHILE the selected Node is `locked`, THE Node_Detail SHALL show "Finish <prerequisite titles> to unlock this skill." and SHALL hide the quests and the fresh content. <prerequisite titles> lists the titles of the Node's prerequisites that are not completed, in `prerequisites` order, separated by ", " with " and " before the last title.
10. IF the selected Node is the Current_Node or is in the `side_quest` state, THEN THE Node_Detail SHALL show an enabled primary button labeled "Mark complete".
11. WHILE the selected Node is `completed`, THE Node_Detail SHALL show the button as disabled with the label "Completed".
12. WHILE the selected Node is `locked`, or is a `milestone` Node that is not the Current_Node, THE Node_Detail SHALL show the button as disabled with the label "Locked".
13. WHEN the user activates the close button, taps the backdrop or presses Escape while the Bottom_Sheet is open, THE Bottom_Sheet SHALL close and keep all quest checks made while it was open.
14. WHILE the Bottom_Sheet is open, THE Bottom_Sheet SHALL keep keyboard focus inside the Bottom_Sheet. Tab on the last focusable element moves focus to the first one, and Shift+Tab on the first focusable element moves focus to the last one.
15. WHILE the viewport is a Desktop_Viewport and the selected Node is not the Current_Node, THE Path_View SHALL draw an `ink` outline around the selected Node and SHALL draw no `ink` outline around any other Node.
16. WHEN the Bottom_Sheet closes, THE Path_View SHALL move keyboard focus to the Node button that opened the Bottom_Sheet.
17. WHEN the Bottom_Sheet opens, THE Bottom_Sheet SHALL move keyboard focus to its close button.

### Requirement 9: Completing a node and the unlock moment

**User Story:** As a learner, I want a small celebration when I finish a skill, so that progress feels rewarding.

#### Acceptance Criteria

1. WHEN the user activates an enabled "Mark complete" button, THE Progress_Engine SHALL add the selected Node id to the Progress completed set and SHALL leave the checked quests of every Node unchanged.
2. IF the "Mark complete" button is disabled, THEN THE Path_View SHALL ignore activation of the button and leave the Progress, the Node_States and the Header_Stats unchanged.
3. WHEN a Main_Node, including a Milestone_Node, is completed, THE Path_View SHALL show the Unlock_Moment card with the text "+50 XP", the text "<completed Node title> complete" and the title of the new Current_Node. If no Current_Node remains, the card SHALL show "Path complete" in place of the new Current_Node title.
4. WHILE the Unlock_Moment card is shown, THE Path_View SHALL keep the card visible until the user activates "Continue", with no automatic dismissal, and SHALL move keyboard focus to the "Continue" button when the card opens.
5. WHEN a Node is completed, THE Path_View SHALL play an unlock animation lasting at most 600 ms on each Node whose state changed from `locked` to `current` or to `side_quest` because of that completion. Nodes whose state did not change SHALL not be animated.
6. WHILE Reduced_Motion is active, THE Path_View SHALL apply the new Node_States in the same frame as the completion, with no unlock animation. The Unlock_Moment card SHALL still be shown under criterion 3.
7. WHEN the user activates "Continue" on the Unlock_Moment card and a Current_Node exists, THE Path_View SHALL close the card, close the Bottom_Sheet on Mobile_Viewport, and select the new Current_Node so that the Side_Panel shows it on Desktop_Viewport.
8. WHEN the user activates "Continue" on the Unlock_Moment card and no Current_Node remains, THE Path_View SHALL close the card, close the Bottom_Sheet on Mobile_Viewport, and keep the just-completed Milestone_Node selected in the Side_Panel on Desktop_Viewport.
9. WHEN a Side_Quest_Node is completed, THE Path_View SHALL show the Side_Quest_Node as `completed` with no Unlock_Moment card. On Mobile_Viewport it SHALL also close the Bottom_Sheet and return focus to that Side_Quest_Node. On Desktop_Viewport it SHALL keep the Side_Quest_Node selected in the Side_Panel with the button disabled and labeled "Completed".

### Requirement 10: Progress persistence

**User Story:** As a learner, I want my progress kept between visits, so that I don't lose my place.

#### Acceptance Criteria

1. WHEN the user toggles a quest checkbox or activates an enabled "Mark complete" button, THE Progress_Store SHALL write the full updated Progress to localStorage under a single key containing a schema version number and the Skill_Tree `hobby` value before the next user interaction is processed.
2. WHEN the Path_View mounts in the browser, THE Progress_Store SHALL read the saved Progress stored under the key for the current schema version and the Skill_Tree `hobby` value, and THE Path_View SHALL show the Node_States derived from that Progress.
3. IF no value is saved under the key for the current schema version and Skill_Tree `hobby`, THEN THE Progress_Store SHALL return an empty Progress (no completed Node ids and no checked quests), making the first Main_Node of the first Section the Current_Node.
4. IF the saved value is not valid JSON, or does not match the Progress schema (a list of completed Node id strings and, per Node id, a list of exactly 3 booleans for its quests), THEN THE Progress_Store SHALL remove the saved value from localStorage and return an empty Progress without showing an error message.
5. IF the saved Progress references Node ids absent from the Skill_Tree in the completed set or in the quest entries, THEN THE Progress_Store SHALL drop those ids and their quest entries and keep every entry for Node ids present in the Skill_Tree unchanged.
6. IF localStorage is unavailable, or a localStorage read or write throws an error, THEN THE Path_View SHALL keep the Progress in memory, keep quest toggling and "Mark complete" working for the current page visit, and show no error message.
7. FOR ALL Progress values that match the Progress schema, serializing with the Progress_Store and parsing the result SHALL produce a Progress with the same completed Node ids and the same checked state for every quest (round-trip property).
8. THE Path_View SHALL render the server-side output from an empty Progress without reading localStorage, and SHALL apply the saved Progress on the client after hydration with no hydration mismatch warning in the browser console.

### Requirement 11: Header stats

**User Story:** As a learner, I want to see my level and XP, so that I feel my progress add up.

#### Acceptance Criteria

1. THE Header_Stats SHALL compute XP as 50 multiplied by the number of Node ids in the Progress completed set that match a Node in the Skill_Tree, counting Main_Nodes, Side_Quest_Nodes and Milestone_Nodes alike, giving 0 XP for an empty Progress.
2. THE Header_Stats SHALL compute the level from the XP using this fixed threshold table: level 1 from 0 to 99 XP, level 2 from 100 to 199 XP, level 3 from 200 to 399 XP, level 4 from 400 to 699 XP and level 5 from 700 XP upward.
3. WHILE the level is below 5, THE Header_Stats SHALL show the level as "Lv N", the XP text as "<XP> / <first XP value of the next level> XP", and an XP bar filled to the XP divided by that next-level value, rounded to the nearest whole percent.
4. WHILE the level is 5, THE Header_Stats SHALL show "Lv 5", the XP text as "<XP> XP" and the XP bar filled to 100%.
5. WHEN a Node is completed, THE Header_Stats SHALL show the new XP, level, XP text and XP bar fill within one frame, without a page reload.
6. THE Header_Stats SHALL show the streak as the static placeholder value 6, unchanged by completing Nodes or toggling quests.
7. WHILE the viewport is a Mobile_Viewport, THE Header_Stats SHALL show the hobby switcher, streak and XP in the first row and the level, XP bar and XP text in a second row, in the left-to-right order of the mobile reference design.
8. WHILE the viewport is a Desktop_Viewport, THE Header_Stats SHALL show the "YOUR PATH" eyebrow and the Skill_Tree hobby title in `font-display` on the left, and the streak, level, XP bar and XP text on the right of the same header row, as in the desktop reference design.
9. FOR ALL valid Skill_Trees and all Progress values, the computed XP SHALL equal 50 times the number of completed Nodes, and the level SHALL never decrease when a Node is added to the completed set (property).

### Requirement 12: Responsive page shell

**User Story:** As a demo viewer, I want the path to look right on a phone and on a laptop, so that the demo works on any screen.

#### Acceptance Criteria

1. WHILE the viewport is a Mobile_Viewport, THE Path_View SHALL show, from top to bottom, the Header_Stats, the path with each Section_Header placed before its Section's first Node as defined in Requirement 7, and an 80 px tall bottom navigation with the items Path, Fresh, Quests and Profile in that order, following the layout of the 390 px reference design in `docs/design/Path-Mobile`.
2. WHILE the viewport is a Mobile_Viewport, THE Path_View SHALL keep the bottom navigation fixed to the bottom edge of the viewport and SHALL let the user scroll the last Node of the path and its label fully above the bottom navigation.
3. WHILE the viewport is a Desktop_Viewport, THE Path_View SHALL show three columns from left to right: a 248 px wide left sidebar with the Pursio logo, the navigation items Path, Fresh feed, Quests and Profile, the "Your hobbies" list and the "+ Add a hobby" button; a center path column at most 640 px wide, centered horizontally in the space between the sidebar and the Side_Panel; and the Side_Panel.
4. WHILE the viewport is a Desktop_Viewport between 1024 px and 1920 px wide, THE Side_Panel SHALL be at least 360 px and at most 460 px wide.
5. WHILE the viewport is a Desktop_Viewport, THE Path_View SHALL keep the left sidebar and the Side_Panel fully visible within the viewport height while the user scrolls the center path column.
6. WHILE the viewport is a Desktop_Viewport, THE Side_Panel SHALL show the static "This week" card, with Monday to Sunday day dots and the text "3 of 4 sessions", below the Node_Detail.
7. THE Path_View SHALL mark the "Path" navigation item as the current page, both visually and with an accessibility attribute that assistive technology reports as the current page, in the bottom navigation and in the left sidebar.
8. IF the user activates a static placeholder navigation item (Fresh, Fresh feed, Quests or Profile), the hobby switcher, a "Your hobbies" entry or the "+ Add a hobby" button, THEN THE Path_View SHALL keep the current route, the Progress and the selected Node unchanged and SHALL show no error.
9. WHILE the viewport is between 320 px and 1920 px wide, THE Path_View SHALL show every Node and every Node label inside the horizontal bounds of the viewport with no horizontal page scrolling.
10. WHEN the viewport width crosses 1024 px in either direction, THE Path_View SHALL switch between the Mobile_Viewport and Desktop_Viewport layouts without a page reload, keeping the Progress, the checked quests and the selected Node unchanged.

### Requirement 13: Theming, style and code conventions

**User Story:** As a developer, I want the path built only from theme tokens and small typed components, so that themes swap without markup changes.

#### Acceptance Criteria

1. THE Path_View components SHALL take every color, font family, border radius and box shadow from Theme_Token utilities (for example `bg-surface`, `text-ink`, `rounded-node`, `shadow-raised-primary`, `font-display`), and SHALL contain no literal color values (hex, `rgb()`, `hsl()`, `oklch()` or named colors), no literal font family names, no literal border-radius values and no literal box-shadow values in templates, inline styles, SVG `fill`/`stroke` attributes or component `<style>` blocks. SVG `fill` and `stroke` SHALL use `currentColor` or a `var(--pursio-*)` reference.
2. WHEN the `data-theme` attribute on `<html>` changes to `trail`, `boulder` or `halloween`, THE Path_View SHALL show the computed colors, fonts, radii and shadows of the new theme on every element without a page reload, while keeping the DOM structure, the Progress, the selected Node and the open or closed state of the Node_Detail unchanged.
3. IF the Path_View needs a color that no existing Theme_Token provides, THEN THE project SHALL add that color as a new `--pursio-*` Theme_Token defined in all three theme blocks (trail, boulder, halloween) of `app/assets/css/themes.css`, mapped in the `@theme inline` block of `app/assets/css/main.css`, and shown as a swatch on `/dev/theme`, before any component uses it.
4. THE Path_View SHALL draw `completed`, `current` and `milestone` Nodes, primary buttons and Banner-style Section_Headers with a solid bottom shadow (0 px horizontal offset, positive vertical offset, 0 px blur) in the matching `-deep` Theme_Token color (`done-deep`, `primary-deep`, `locked-deep`, `gold-deep`, `banner-deep`), and SHALL draw `side_quest` Nodes with a solid bottom shadow in the `line` Theme_Token color.
5. THE Path_View SHALL apply no box shadow or drop shadow with a blur radius greater than 0 px to any element.
6. THE Path_View SHALL use `font-display` for the hobby title in the Header_Stats, the Section titles and the "+50 XP" text; `font-head` for the Node_Detail title, button labels, the quest count header and the "X/Y skills" count; and `font-body` for all other text.
7. THE Path_View SHALL draw every icon as an inline SVG with a stroke width of 2.2 px and `stroke-linecap` set to `round`, and SHALL render no emoji characters in any text or label.
8. THE Path_View SHALL give every interactive element (Node buttons, quest checkboxes, "Mark complete", "Continue", the Bottom_Sheet close button, navigation items, the hobby switcher and "+ Add a hobby") a clickable area at least 44 CSS px wide and 44 CSS px tall at 320 px, 390 px and 1024 px viewport widths.
9. THE Path_View SHALL keep a contrast ratio of 4.5:1 or higher between every visible text element, including Node labels, status lines and disabled button labels, and its rendered background in each of the trail, boulder and halloween themes.
10. THE Path_View components SHALL use `<script setup lang="ts">`, SHALL declare props and emits with TypeScript types, SHALL contain no `any` type, and SHALL pass `yarn typecheck` with exit code 0 in strict mode.

### Requirement 14: Test setup

**User Story:** As a developer, I want automated tests for the data and logic, so that later AI-generated trees can rely on the same checks.

#### Acceptance Criteria

1. THE project SHALL list `zod` and `elkjs` under `dependencies` and `fast-check` and `vitest` under `devDependencies` in `package.json`, each with an exact version string that has no range prefix or wildcard (no `^`, `~`, `>`, `<`, `*` or `x`).
2. THE project SHALL add no new dependency other than `zod`, `elkjs`, `fast-check` and `vitest` to `package.json` in this feature, and SHALL record the installed versions in the committed `yarn.lock`.
3. THE project SHALL provide a `yarn test` script that runs vitest once in non-watch mode and exits without waiting for input or file changes.
4. WHEN `yarn test` runs and every test passes, THE `yarn test` script SHALL exit with code 0.
5. IF any test or property fails during `yarn test`, THEN THE `yarn test` script SHALL exit with a non-zero code and SHALL print the failing test name and, for a failing property, the shrunk counterexample reported by fast-check.
6. THE property-based tests for the Tree_Schema, Tree_Validator, Progress_Engine, Progress_Store, Path_Layout and Header_Stats XP and level logic SHALL use fast-check with at least 100 runs per property, covering every property criterion in Requirements 1, 2, 4, 5, 10 and 11.
7. THE tests for the Tree_Schema, Tree_Validator, Progress_Engine, Progress_Store, Path_Layout and Sample_Tree SHALL run under `yarn test` without a running dev server, a browser or network access.
