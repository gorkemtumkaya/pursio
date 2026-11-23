# Requirements Document

## Introduction

The sample path page is a public, read only page at `/try/<hobby>` for photography, guitar and birdwatching. It shows a finished path, lets the visitor open any skill, and asks for one sentence in a "Make it yours" box. "Build my path" hands the hobby and the note to the existing new hobby flow. It is the landing page for ads: ad visitors today reach the landing page, scroll, and leave without typing a hobby.

The user scenarios, the owner's decisions, the assumptions (AS) and the open decisions (OD) are in [scenarios.md](scenarios.md). The layout follows the four mockups `dev_docs/SAMPLE PAGE · *.png`, adapted to the project: existing components are reused and only theme tokens are used. Where the brief and the mockups differ, the brief wins (AS10).

This spec touches three earlier specs. Everything in them that this document does not name stays in force.

| Earlier spec | What changes | Where |
|---|---|---|
| `skill-path-ui` | The path canvas, node, tag, section header, quest row and finish line card gain an optional preview mode. With it off they render as before | Requirements 5, 6, 7 |
| `path-intake`, `landing-page` (hobby handoff) | `/new` takes a note from the sample handoff, and accepts `start=0` to fill the hobby without starting | Requirements 1 and 10 |
| `accounts-cloud-save` | The global session middleware skips `/try/` | Requirement 3 |

Out of scope: path generation, the video pipeline, billing, the real path screen's behavior, new database tables, a calligraphy page, a `/try` index page (AS8).

## Glossary

Terms from earlier specs keep their meaning: Skill_Tree, Node, Section, Milestone_Node, Note, Panel, Intake_Failure, Demo_Mode. New terms:

- **Sample_Page**: the page at `/try/<slug>` for a Sample_Slug.
- **Sample_Slug**: `photography`, `guitar` or `birdwatching`.
- **Sample_File**: `data/samples/<slug>.json`, one per Sample_Slug.
- **Sample**: the checked content of a Sample_File.
- **Skill**: one entry of `sections[].skills` in a Sample.
- **Preview_Mode**: the read only mode of the reused path components.
- **Skill_Preview**: the block that shows one Skill: the right column on desktop, a bottom sheet on mobile.
- **Mine_Box**: the "Make it yours" form.
- **Mine_Sheet**: the mobile bottom sheet that holds the Mine_Box.
- **Intent_Action**: a press on "Build my path" or on "Skip, build it without a note".
- **Handoff**: the hobby and the note passed from the Sample_Page to `/new`.
- **Campaign_Params**: the query keys `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id`, `rdt_cid`, `gclid`, `fbclid`, `ttclid` and `msclkid` (AS9).
- **Dash_Character**: U+002D, U+2010 to U+2015, U+2212, U+FE58, U+FE63 or U+FF0D.
- **Desktop** and **mobile**: at or above, and below, the 1024 px breakpoint of the path screen.

## Requirements

### Requirement 1: Route

**User Story:** As an ad visitor, I want the ad link to open a finished path for the hobby in the ad, so that I see what I would get before I type anything.

#### Acceptance Criteria

1. THE app SHALL show the Sample_Page at `/try/<slug>` when `<slug>` is exactly one of the three Sample_Slugs. No other value is a Sample_Page.
2. WHEN `/try/<slug>` is opened with any other slug, THE app SHALL redirect to `/new` with status 302, with `hobby` set to the hobby text of criterion 3, `start=0`, and the Campaign_Params of the request.
3. THE hobby text SHALL be the decoded slug with hyphens and underscores replaced by spaces, runs of spaces reduced to one, trimmed and cut to 60 characters. IF the result is empty, or holds a character other than a letter, a digit, a space, an apostrophe, `&` or `.`, THEN the redirect SHALL carry no `hobby` and no `start` (AS1).
4. THE redirect SHALL work for a direct request (server response) and for a navigation inside the app.
5. WHEN `/new` opens with a valid `hobby` and `start=0`, THE page SHALL fill the hobby field, send no intake request, and remove `hobby` and `start` from the URL while keeping every other query key. Without `start=0` the hobby handoff works as today.
6. THE three Sample_Pages SHALL be prerendered at build time.
7. THE HTML of each Sample_Page SHALL hold `<meta name="robots" content="noindex">`.
8. THE Sample_Page SHALL render the same for a visitor with no session and for a visitor with a session and paths, and SHALL never redirect because of a session, an account or its paths.
9. THE page title SHALL be "<Hobby> sample path · Pursio".

### Requirement 2: Sample data

**User Story:** As the owner, I want each sample to be a file I can edit and commit, so that changing a sample needs no database and no deploy step other than a build.

#### Acceptance Criteria

1. THE repo SHALL hold one Sample_File per Sample_Slug with this shape: `{ slug, hobby, mascot, finish, sections: [ { level, name, skills: [ { id, title, desc, milestone, quests: [string × 3], videos: [ { id, title, channel, durationSeconds, thumbnailUrl } ] } ] } ] }`.
2. THE Sample_Files SHALL be imported at build time. THE Sample_Page SHALL send no request to load a Sample.
3. A Sample_File SHALL pass these checks: `slug` equals the file name and is a Sample_Slug; `hobby` and `finish` are not empty, at most 60 and 80 characters; `level` is `beginner`, `intermediate` or `advanced`; at least 1 section and at least 1 skill per section; skill ids are unique in the file and match `^[a-z0-9-]+$`; `title` and `desc` are not empty; `quests` holds exactly 3 strings that are not empty; `milestone` is a boolean; `videos` is a list of 0 or more entries; a video id matches `^[A-Za-z0-9_-]{11}$`, its `title` and `channel` are not empty, `durationSeconds` is a positive integer and `thumbnailUrl` is an `https://i.ytimg.com/` URL.
4. A Sample_File that fails a check SHALL fail `yarn test`. IF a Sample cannot be read at run time, THEN its slug SHALL be treated as unknown (Requirement 1, criterion 2).
5. THE page SHALL take the number of sections, skills, quests shown and videos from the Sample. No count of sections or skills SHALL be fixed in code. A file with 2 sections and 9 skills and a file with 3 sections and 14 skills SHALL both render (Requirement 14, criterion 5).
6. IF `mascot` is not a known outfit, THEN Wick SHALL wear the default outfit, `explorer`.
7. A skill with an empty `videos` list SHALL be valid.
8. THE export `data/sample-paths.json` (a list of `{ slug, sample }` with `sample` as a JSON string) SHALL stay in the repo as the source of the Sample_Files. A committed script SHALL convert it into the three Sample_Files (decision 16).
9. THE script SHALL be safe to run again on a refreshed export: it SHALL overwrite the Sample_Files, write the same bytes for the same input (keys in the order of criterion 1, 2 space indentation, a final newline), stop with a message and write nothing when an entry cannot be parsed or its `slug` is not a Sample_Slug, and leave the file of a Sample_Slug that is missing from the export untouched, with a warning.
10. THE way to refresh the samples SHALL be documented in the script's header comment and in `data/samples/README.md`: replace the export, run the script, run `yarn test`.

### Requirement 3: No cost before intent

**User Story:** As the owner, I want an ad click to cost nothing until the visitor asks for a path, so that bots and bounces do not create users or model calls.

#### Acceptance Criteria

1. FROM the load of a Sample_Page UNTIL an Intent_Action, THE page SHALL NOT start a session (anonymous included), build the Supabase client, read or refresh a stored session, write to the database, or call `/api/intake`, `/api/tree`, `/api/videos`, `/api/videos/fill`, `/api/fresh`, `/api/billing/*` or `/api/founding/*`.
2. THE global session middleware SHALL NOT start a session for a path that starts with `/try/`.
3. THE only requests of the Sample_Page before an Intent_Action SHALL be: the app's own files, fonts, analytics, video thumbnails from `i.ytimg.com`, and, after a tap on a video, the YouTube embed.
4. THE Sample_Page SHALL record no watch event: no call to the video event recorder, nothing added to the stored video events, and no `video_*` analytics event.
5. THE Sample_Page SHALL write nothing of its own to localStorage, sessionStorage or cookies.
6. "Log in" and the logo SHALL be plain links. THE Sample_Page SHALL start nothing when they are pressed (decision 13).
7. Criteria 1 to 5 SHALL hold when a stored session exists.
8. THE first session start SHALL be the one `/new` makes after an Intent_Action, as it does for every visitor today.

### Requirement 4: Top bar and intro card

**User Story:** As a visitor, I want to see at once that this is an example and what it leads to.

#### Acceptance Criteria

1. THE top bar SHALL show the Pursio logo, linking to `/`, and the tag "SAMPLE PATH" with a dashed outline in the accent color.
2. ON desktop THE top bar SHALL also show a "Log in" link to `/path` and the primary button "Build my own path". ON mobile it SHALL show neither.
3. WHEN "Build my own path" is pressed, focus SHALL move to the textarea of the Mine_Box.
4. THE intro card SHALL show Wick in the Sample's outfit and the theme's colors, idle and hidden from screen readers, to the left of the text.
5. THE intro card SHALL show the line "<HOBBY> · <N> SKILLS · <M> SECTIONS" in upper case in the accent text color, where N and M are counted from the Sample, with "1 SKILL" and "1 SECTION" for a count of 1.
6. THE intro card SHALL show the Sample's `finish` as the page's only `h1`, and below it: "Tap any skill to see its quests and videos. This is an example. Tell Wick where you are and he rebuilds it around you."
7. THE top bar and the intro card SHALL be part of the prerendered HTML.

### Requirement 5: The path

**User Story:** As a visitor, I want the sample to look like the real product, so that I know what I will get.

#### Acceptance Criteria

1. THE path SHALL be drawn by the components and the layout engine of the real path screen (`PathCanvas`, `PathNode`, `PathNodeLabel`, `PathSectionHeader`, `PathTrail`, `PathProgressRing`, `PathNextUpTag`, `usePathLayout`) in Preview_Mode, from a Skill_Tree built from the Sample: sections and skills in file order, every skill a main node whose only prerequisite is the skill before it.
2. THE path SHALL show one header per section with "SECTION <n> · <LEVEL>" and the section name. THE first header SHALL be the banner with "<k> skills" ("1 skill" for 1), where k is that section's count. Every later header SHALL be the divider, with "Opens after the first milestone" for the second section, "Opens after the second milestone" for the third, "Opens after the milestone above" for any later one, and no such line when the section before it has no milestone (AS4).
3. THE first skill SHALL have the current look (or the current milestone look when it is a milestone) with the tag "START HERE" above it.
4. EVERY other skill SHALL have the locked look, or the milestone look when it is a milestone, and SHALL stay enabled.
5. THE sub label SHALL be "Milestone" for a milestone and "Tap to preview" for any other skill. THE first skill's sub label SHALL be "3 quests · <v> videos" ("1 video" for 1), or "3 quests" when it has no video (AS3).
6. EVERY skill SHALL be a button named "<title>, <sub label>" that opens its Skill_Preview (Requirement 7).
7. Preview_Mode SHALL be optional props that are off by default. With them off, the real path screen SHALL render and behave exactly as before, and its existing tests SHALL pass unchanged.
8. THE Sample_Page SHALL hold no Progress: nothing can be completed, no XP is shown, and no unlock card, save prompt, week card, sidebar or bottom navigation appears.
9. WHILE the layout is not ready, THE path SHALL show the loading state of the path screen. IF the layout fails, THEN it SHALL show "This path could not be drawn." and the Mine_Box SHALL stay usable.

### Requirement 6: Finish line card

**User Story:** As a visitor, I want to see where the path ends.

#### Acceptance Criteria

1. THE existing finish line card SHALL be shown below the last skill, in a static variant: the flag icon, "THE FINISH LINE" and the Sample's `finish`.
2. THE static variant SHALL show no count, no bar, no "to go" text and no reached state, and SHALL not use a heading element for the finish text, because the intro card already holds it as `h1`.
3. THE static variant SHALL be an optional prop that is off by default (Requirement 5, criterion 7).

### Requirement 7: Skill preview

**User Story:** As a visitor, I want to open any skill and see what I would do in it.

#### Acceptance Criteria

1. ON desktop THE Skill_Preview SHALL be in a sticky right column, and the first skill SHALL be selected when the page opens.
2. ON desktop, WHEN a skill is clicked, THE Skill_Preview SHALL show it and its node SHALL get the selection outline of the path screen.
3. ON mobile, WHEN a skill is tapped, THE Skill_Preview SHALL open in the existing bottom sheet. No sheet SHALL be open when the page opens.
4. THE Skill_Preview SHALL show, in this order: a tag, "FIRST SKILL" for the first skill and "PREVIEW" for any other, with "Section <s> · Skill <k>" beside it; the title as a heading; the description; "3 QUESTS" with "+10 XP EACH", the number taken from the app's quest XP constant; the 3 quests as rows in the look of the path screen's quest row with an empty box; then the videos (Requirement 8).
5. A quest row SHALL NOT be a button, a checkbox or a label, SHALL NOT take focus, and SHALL have no pointer cursor. Its box SHALL be hidden from screen readers.
6. THE Skill_Preview SHALL show no state chip of the path screen, no lock note and no "Mark complete" or "Locked" button.
7. THE bottom sheet SHALL close with its close button, a tap on the backdrop and Escape, and focus SHALL return to the skill's node.
8. ON mobile THE Skill_Preview SHALL end with the primary button "Make this path mine", which closes the sheet and opens the Mine_Sheet.
9. THE selected skill SHALL survive a change between desktop and mobile. A change to mobile SHALL NOT open a sheet.

### Requirement 8: Videos in the preview

**User Story:** As a visitor, I want to see the kind of videos Pursio picks, without Pursio spending anything on me yet.

#### Acceptance Criteria

1. WHERE a skill has at least 1 video, THE Skill_Preview SHALL show the heading "VIDEOS PICKED FOR THIS SKILL" and one existing video card per video, in file order, in the card's list layout.
2. WHEN a card is tapped, THE video SHALL play in the existing embedded player inside that card, with the existing "Close video" button.
3. AT most 1 video SHALL play at a time. Selecting another skill or closing the sheet SHALL close the player.
4. THE page SHALL ignore the player's and the card's play, progress and skip signals (Requirement 3, criterion 4).
5. WHERE a skill has no video, THE Skill_Preview SHALL show the one line "Videos appear when you reach this skill.", with no heading and no empty block.
6. THE card SHALL show no language label.

### Requirement 9: Make it yours

**User Story:** As a visitor, I want to say in one sentence where I am, so that the path is rebuilt for me.

#### Acceptance Criteria

1. THE Mine_Box SHALL show: the heading "Make it yours"; the label "Tell Wick where you are and where you want to get. He rebuilds this path around you.", linked to the textarea; the textarea, with the example note of the Sample_Slug as placeholder (decision 15); the primary button "Build my path"; and the line "Free to try. No signup. About 20 seconds."
2. THE textarea SHALL be the note field of the new hobby page: it grows with its content up to its maximum height and then scrolls, accepts at most 800 characters, and shows "<n> left" from 40 left, linked for screen readers (AS6).
3. ON desktop THE Mine_Box SHALL sit in the right column under the Skill_Preview, in a card tinted with the soft primary color and a primary border. THE column SHALL be as tall as the window at most, and the Skill_Preview SHALL scroll inside it, so the Mine_Box is always in view.
4. ON mobile THE page SHALL show a sticky bottom bar with "Make it yours", "Free. No signup." and the primary button "Tell Wick where I am". WHEN the button is pressed, THE Mine_Sheet SHALL open with the Mine_Box and, under "Build my path", the text button "Skip, build it without a note".
5. THE path SHALL keep enough space at its end that the sticky bar never covers the finish line card, and the bar SHALL respect the device's bottom safe area.
6. THE Mine_Sheet SHALL close with its close button, the backdrop and Escape. Focus SHALL return to the control that opened it, or to the skill's node when it was opened from the skill sheet.
7. THE note SHALL be one value: it SHALL survive closing and reopening the Mine_Sheet and a change between desktop and mobile.
8. "Build my path" SHALL work with an empty note.
9. ON desktop THE Mine_Box SHALL show no "Skip" button.
10. ON desktop, under the Mine_Box, THE page SHALL show the founding line of Requirement 13 with "See the offer" as a plain link to `/?landing=1#founding`. The line SHALL hold no price and no seat count, and the page SHALL send no request for it (decision 14). `landing=1` keeps a visitor who has paths on the landing page instead of redirecting them to `/path`.
11. ON mobile THE founding line SHALL NOT be shown.

### Requirement 10: Handoff

**User Story:** As a visitor who pressed "Build my path", I want to continue where the question has already been asked, so that I do not start over on an empty form.

#### Acceptance Criteria

1. WHEN "Build my path" is pressed, THE page SHALL keep the Handoff in client memory, with the Sample's `hobby` and the trimmed note, and SHALL open `/new` with `hobby` set to the Sample's `hobby` plus the Campaign_Params of the current URL.
2. WHEN "Skip, build it without a note" is pressed, THE page SHALL do the same with an empty note, whatever was typed.
3. THE note SHALL never be part of a URL, of localStorage, sessionStorage or a cookie, or of an analytics event.
4. WHEN `/new` opens through the Handoff, THE page SHALL take the note only if the Handoff's hobby equals the `hobby` of the URL and the Handoff is at most 60 seconds old, SHALL fill the hobby and the note, and SHALL start intake as soon as the session is ready. THE visitor SHALL see the loading state, then the form with both fields filled while Wick reads, then the Panel. THE empty input state SHALL NOT be shown.
5. THE Handoff SHALL be read at most once and removed from memory when read. A refresh, or back and forward, SHALL start nothing, as today.
6. THE Campaign_Params SHALL be copied only when their value is a string of at most 200 characters, and SHALL stay in the URL of `/new` after `hobby` is removed.
7. A second press while the navigation runs SHALL do nothing.
8. FROM the start of intake on, THE flow SHALL be the existing one, unchanged: an Intake_Failure builds at once, the free plan limit shows its card, errors keep the hobby and the note.
9. WITH an empty note THE result SHALL equal today's hobby handoff from the landing page.

### Requirement 11: Analytics events

**User Story:** As the owner, I want to see how far ad visitors get on the sample page.

#### Acceptance Criteria

1. THE events `sample_viewed`, `sample_skill_opened`, `sample_mine_opened` and `sample_build_clicked` SHALL be added to the analytics client's event names and sent through it.
2. EACH of them SHALL carry `hobby`, the Sample_Slug, and each of `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` and `utm_term` that the page URL holds. A missing parameter SHALL be left out.
3. `sample_viewed` SHALL be sent once per page load, in the browser, after the page is mounted.
4. `sample_skill_opened` SHALL be sent with `skill_id` when the visitor opens a skill: on desktop a click on a skill that is not selected, on mobile each opening of the skill sheet. THE default selection SHALL send nothing.
5. `sample_mine_opened` SHALL be sent at most once per page load, at the first of: the Mine_Sheet opens, "Build my own path" is pressed, or the desktop textarea takes focus. It SHALL carry `source`: `bar`, `skill_sheet`, `top_bar` or `note_focus` (AS7).
6. `sample_build_clicked` SHALL be sent once per Handoff with `has_note` (true when the note passed on is not empty) and `skipped` (true for the Skip button).
7. NO event SHALL hold the note, a part of it or its length.
8. A blocked or failing analytics client SHALL change nothing on the page.

### Requirement 12: One funnel chain (bug APP-ANALYTICS-01)

**User Story:** As the owner, I want a visitor's events from the first page to the generated path under one identity, so that the funnel can be read.

This is a bug fix. It follows the global rule `bug-fixes.md` (ledger entry in `KNOWN_BUGS.md`, plan and review stop in `changes.md`) and is the first task. What was found on 2026-11-23:

| Check (production host, since the first production event on 2026-11-22) | Result |
|---|---|
| `landing_viewed` | 229 events, 214 ids |
| `intake_shown`, `intake_answered`, `skill_path_generated` | 17, 16 and 17 events from 8, 7 and 8 ids. They do arrive |
| Ids whose `landing_viewed` carries a utm parameter (all Reddit) | 70. Of these, 1 opened `/new`, 0 submitted the hero form, 0 reached `intake_shown` |
| Ids with a `/new` page view | 14, of which 8 sent `intake_shown` |
| Server `$ai_generation` events | 145, under 11 Supabase user ids and 13 server process ids. None of these ids has any browser event |

So the three events are not lost. In any view filtered to ad traffic they are absent because no ad visitor got that far, which is the problem the Sample_Page addresses. Two real defects remain: server events are sent under the Supabase user id while the browser uses PostHog's own id (an anonymous user is never identified), and the only "generated" event is sent by the browser after a build of about 20 seconds, so it is lost when the tab closes.

#### Acceptance Criteria

1. THE browser SHALL send its PostHog distinct id and session id with `POST /api/intake` and `POST /api/tree`, in the headers `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID`, set by the app's own code.
2. THE server SHALL use that distinct id for the `$ai_generation` events of the request and SHALL add the session id as `$session_id`. IF the header is missing, empty, longer than 200 characters or holds a control character, THEN the server SHALL use the user id, as today.
3. THE Tree_Route SHALL send `skill_path_generated` from the server for every answer with status 200, with `start_level`, `cached` and the identity of criterion 2.
4. THE browser SHALL no longer send `skill_path_generated` (decision 13).
5. THE headers SHALL NOT be used for authentication, rate limits or anything stored in the database.
6. THE `$ai_generation` events of background jobs SHALL stay as they are.
7. AFTER the deploy, one walk through on production SHALL show `sample_viewed` (or `landing_viewed`), `intake_shown`, `intake_answered`, `skill_path_generated` and the build's `$ai_generation` events under one distinct id. THE result SHALL be written into `changes.md`, and the ledger entry moved to Fixed.

### Requirement 13: Copy

**User Story:** As the owner, I want the page's text free of dashes and kept in one place.

#### Acceptance Criteria

1. EVERY fixed text of the Sample_Page SHALL live in one copy module, with exactly these strings:

   | Where | Text |
   |---|---|
   | Tag | SAMPLE PATH |
   | Top bar | Log in · Build my own path |
   | Intro line | <HOBBY> · <N> SKILLS · <M> SECTIONS |
   | Intro text | Tap any skill to see its quests and videos. This is an example. Tell Wick where you are and he rebuilds it around you. |
   | Node tag | START HERE |
   | Sub labels | Tap to preview · Milestone · 3 quests · <v> videos |
   | Divider lines | Opens after the first milestone · Opens after the second milestone · Opens after the milestone above |
   | Finish card | THE FINISH LINE |
   | Preview tags | FIRST SKILL · PREVIEW |
   | Preview | Section <s> · Skill <k> · 3 QUESTS · +10 XP EACH |
   | Videos | VIDEOS PICKED FOR THIS SKILL · Videos appear when you reach this skill. |
   | Mine_Box | Make it yours · Tell Wick where you are and where you want to get. He rebuilds this path around you. · Build my path · Free to try. No signup. About 20 seconds. |
   | Mobile | Tell Wick where I am · Free. No signup. · Skip, build it without a note · Make this path mine |
   | Placeholder, photography | I shoot on auto with a mirrorless camera. I want portraits with a soft background. |
   | Placeholder, guitar | I know a few chords and play the same old songs. I want to sing while I play. |
   | Placeholder, birdwatching | I can only name a sparrow and a crow. I want to know the birds in my local park. |
   | Placeholder, fallback | I am new to this. I want to get good enough to enjoy it. (draft) |
   | Founding line, desktop | Founding members keep Plus for life. · See the offer (draft, the owner confirms the wording) |
   | Page title | <Hobby> sample path · Pursio |

2. NO Dash_Character SHALL appear in any string of the copy module, in any accessible name the page sets, or in the `hobby`, `finish`, section names, skill titles, descriptions and quests of a Sample_File.
3. Video titles and channel names SHALL be shown as published and are not covered by criterion 2 (decision 13).
4. Text of reused components that shows on the page ("Close", "Close video", "<n> left") SHALL hold no Dash_Character.

### Requirement 14: Accessibility and behavior

**User Story:** As a visitor on a phone, with a keyboard or with a screen reader, I want the page to work.

#### Acceptance Criteria

1. EVERY control SHALL be a real `button` or link element, and the textarea SHALL have a label.
2. BOTH sheets SHALL be dialogs named by their heading, SHALL trap focus, SHALL close with Escape and SHALL return focus (Requirement 7, criterion 7; Requirement 9, criterion 6).
3. EVERY tap target SHALL be at least 44 by 44 px.
4. EVERY interactive control on the page SHALL show the pointer cursor, the reused video and sheet buttons included. A disabled control and a quest row SHALL NOT.
5. AT a width of 360 px THE page SHALL have no sideways scroll and no clipped or overlapping text, for a Sample with 3 sections and 14 skills and for one with 2 sections and 9 skills.
6. THE page SHALL use theme tokens only, keep a text contrast of at least 4.5:1, show a visible focus outline on every control, and switch off sheet motion under reduced motion.
7. THE headings SHALL be in order: the finish line as `h1`; section names, the preview title and "Make it yours" as `h2`; the quest and video headings as `h3`.

### Requirement 15: What does not change

**User Story:** As the owner, I want this page to leave the product untouched.

#### Acceptance Criteria

1. NO change SHALL be made to path generation, prompts, the video pipeline, billing, or the database schema.
2. `/path` SHALL look and behave as before. Components shared with it SHALL only gain optional props that are off by default.
3. THE changes to `/new` SHALL be limited to Requirement 1, criterion 5, Requirement 10, criterion 4, and the headers of Requirement 12.
4. NO dependency SHALL be added. Playwright is not added for now (decision 13).

### Requirement 16: Tests

**User Story:** As the owner, I want the acceptance checks of the brief kept as tests.

#### Acceptance Criteria

1. Check 1: tests SHALL show that `/try/guitar` starts no session and sends no request to the database, the model or `/api/videos`: the session rule for `/try/` paths, and a static guard over the page's own files (design.md, "No cost before intent"). The request list in a real browser is checked by hand, manual row A1, which is part of the launch gate.
2. Check 2: a test SHALL show that an unknown slug gives the redirect of Requirement 1, with the hobby prefilled and `start=0`.
3. Check 3: a test SHALL show that the decision to show a Sample_Page takes only the slug, and that the session rule skips `/try/` whatever is stored.
4. Check 4: a test SHALL show that a skill with an empty `videos` list gives the fallback line and no heading.
5. Check 5: a test SHALL show that a Handoff with a note gives a target of `/new` whose query holds the hobby and no part of the note, and that `/new` takes that note once and starts intake.
6. Check 6: a test SHALL walk the event tracker through view, skill, mine and build, and find each event once, with `hobby` and the utm properties.
7. Check 7: tests SHALL lay out the path of a Sample with 3 sections and 14 skills and of one with 2 sections and 9 skills, for both viewport classes, and find no overlap and no label wider than a 360 px column allows.
8. Tests SHALL also cover: the Sample_File checks on the three real files, the copy rule (Requirement 13), the pointer cursor rule (Requirement 14, criterion 4), the unchanged look of the path components with Preview_Mode off, and the server identity rules of Requirement 12.
9. THE manual test matrix of design.md SHALL have at least one row per confirmed scenario.
10. Rows A1, B5, E1 and F1 of the manual matrix SHALL pass before launch. The other rows SHALL be checked after launch, and their results tracked in `changes.md` (decision 17).
