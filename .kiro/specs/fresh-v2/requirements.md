# Requirements Document

## Introduction

Fresh v2 redesigns the Fresh_Page around hobbies: one tinted section per path, each a horizontal carousel, filtered by hobby chips, with a cross-hobby Hero_Card and a Sources_Panel grouped into an accordion. The user scenarios and the owner's decisions are in [scenarios.md](scenarios.md); requirements refer to decisions as "(decision n)".

This spec changes the `fresh` spec ([requirements](../fresh/requirements.md)). Everything in `fresh` that this document does not replace stays in force, in particular: the Fresh_Check and Check_Route (Req 1, 3 to 7), the Fresh_Endpoint (Req 8, extended here only by the Color_Slot), ranking (Req 9, criteria 1 to 10 and 13 to 15), channel mutes (Req 2), Save_Snapshots and Video_Events (Req 17), secrets and Client requests (Req 18), Navigation (Req 10), and Demo_Mode being read only (decision D13).

**Replaced from `fresh`:**

| `fresh` requirement | Replaced by |
|---|---|
| Req 11 (layout and header) | Requirement 1 |
| Req 12 (Hero_Card) | Requirement 3 |
| Req 13 (New_Section and Best_Section) | Requirements 4, 5, 6, 7 |
| Req 14 (Filter_Chips) | Requirement 2 |
| Req 15, criteria 1, 3, 4, 5, 8, 9 (Sources_Panel layout) | Requirement 8 (criteria 2, 6, 7, 10 stay) |
| Req 16, criteria 2 and 3 (quiet and empty lines) | Requirement 10 |
| Req 9, criteria 11, 12 and 16 (Best_Section order, de-duplication, Skill cap) | Requirement 5 |
| Req 19, criteria 11, 13, 19 and 22 (page tests) | Requirement 12 |
| Decisions D4, D7, D10 and D17 | Decisions 2, 6, 3 and Requirement 5, criterion 5 |

Layout references: `dev_docs/NEW · Fresh v2, desktop (grouped by hobby, try the chips)@1x.png` and `dev_docs/NEW · Fresh v2, mobile (scrolls)@1x.png`. Where the owner decisions differ from the mockups (carousels on desktop, the "done" count, the mobile path link), the decisions win.

Out of scope stays as in `fresh`: no articles, no non-YouTube sources, no XP on watching.

## Glossary

Terms from the `fresh` and `skill-video-pipeline` specs keep their meaning (Fresh_Item, Video_Pool, Channel_Source, Channel_Mute, Current_Skill, Current_Window, Path_Match, Closeness_Factor, Variety_Window, Save_Snapshot, Video_Event, Demo_Mode, Demo_Paths, Embed_Player, Why_Line). New or changed terms:

- **Hobby_Chip**: a Filter_Chip that selects one path. Its label is the path's hobby.
- **Scope**: the paths the selected chip covers: all the user's paths under "All hobbies", one path under a Hobby_Chip. "Saved" has no Scope for the Hero_Card and sections.
- **Path_Order**: the order of paths on the page. Paths are sorted by Active_Time descending; paths with no Active_Time come after, in Fresh_Endpoint response order.
- **Active_Time**: the later of a path's last open time and last progress save time (`FreshPath.activeAt`).
- **Shown_Item**: a Fresh_Item that is in Scope, has a published time less than 604800 seconds (7 days) before the Fresh_Endpoint response time, and whose channel id has no Channel_Mute with muted true for the user.
- **New_Item**: a Shown_Item published less than 86400 seconds (24 h) before the Fresh_Endpoint response time (decision 4).
- **Shown_New_Item**: a New_Item that is on the page under "All hobbies": in the Hero_Card or as a card of a Hobby_Section after the caps of Requirement 5, criterion 5. Every "new" count uses Shown_New_Items, so a badge never promises more new cards than the page shows (D-A).
- **Hobby_Section**: the section of one path on the Fresh_Page, with a Section_Header and either a Carousel or a header-only line.
- **Carousel**: a horizontally scrolling row of cards inside a Hobby_Section.
- **Color_Slot**: an integer from 1 to 5 stored with each path, which picks the path's hobby colors (decision 1).
- **Hobby_Colors**: the three theme tokens of a Color_Slot `n`: `--pursio-hobby-n` (tint, the section background), `--pursio-hobby-n-deep` (dot, avatar fill, accent text) and `--pursio-hobby-n-ink` (text on the deep color).

## Assumptions

Small points the decisions do not settle. Each is open to change.

- **AS1. Mobile section subtitle.** At mobile width, the Section_Header subtitle is "On <current skill>", as in the mobile mockup; the "<completed> of <total> done" part is shown at desktop width only.
- **AS2. Signed-out order.** Signed-out and Demo_Mode paths have no Active_Time today (`fresh` Req 8, signed-out scope), so their Path_Order is the response order, which is the order the paths were added locally. Tracking a local last-open time is a follow-up, not part of this spec.
- **AS3. Finished paths.** Under decision 11 a finished path's section is header-only, so its Fresh_Items show nowhere on the page and count in no "new" number. This narrows `fresh` decision D16, which let finished paths contribute Fresh_Items.
- **AS4. Width between mobile and desktop.** From 640 px up to 1024 px, about 2.3 cards are visible, so the step between 1.6 and 3.3 stays even.
- **AS5. Arrow step.** An arrow button scrolls by the number of fully visible cards (at least 1) and snaps to a card.
- **AS6. Header filter label.** The old filter label ("Bouldering · …") is dropped from the eyebrow, because the selected chip already shows the filter.
- **AS7. Quiet line.** The `fresh` line "No new videos today. Here are the best ones for your skills." stays, under the same condition (Requirement 10, criterion 2).

The owner moved on to the design without changing AS1 to AS7, so the design takes them as accepted.

### Design-phase clarifications

- **D-A. "New" counts what is shown.** The 3-per-Skill and 12-per-section caps can leave a New_Item off the page. The counts therefore use Shown_New_Items. The per-path count is the same under "All hobbies" and under that path's Hobby_Chip, because the Skill cap is per path and the Hero_Card video is counted in both.
- **D-B. Variety may move a new card behind a known one.** The variety rule runs on the whole Hobby_Section, so in rare cases a Fresh_Item moves behind a Video_Pool card. Fresh_Items are never removed and keep their order among themselves.
- **D-C. Old request bodies.** A signed-out request path without `colorSlot` or `completedCount` (a tab opened before the deploy) is read as slot 1 and 0 completed. A present but invalid value returns 400.

## Requirements

### Requirement 1: Layout and header

**User Story:** As a learner, I want to see at a glance how fresh the page is and how much is new, so that I know whether there is something to watch today.

#### Acceptance Criteria

1. WHILE the viewport is 1024 px wide or wider (desktop width), THE Fresh_Page SHALL show the left navigation, a main column with the header, the Filter_Chips, the Hero_Card and the Hobby_Sections in that top-to-bottom order, and a right column with the Sources_Panel.
2. THE header SHALL show an eyebrow "Updated <relative time>" above the title "Fresh". The relative time, its 60-second refresh, its Scope and its hiding when no check time is known SHALL follow `fresh` Req 11, criteria 5 and 6, with the paths in Scope of the selected chip (all paths for "All hobbies" and "Saved"). The eyebrow SHALL show no filter label (AS6).
3. WHILE the viewport is narrower than 1024 px (mobile width), THE Fresh_Page SHALL show one column with the header and a "Sources" button, the Filter_Chips, the Hero_Card above the first Hobby_Section, the Hobby_Sections and the bottom navigation, and no right column (decision 7).
4. WHILE the viewport is desktop width and the Scope holds 1 or more Shown_New_Items, THE header SHALL show, right-aligned, "<n> new video(s) today across <m> hobby/hobbies", where n is the number of distinct video ids among the Shown_New_Items of the paths in Scope (the Hero_Card video counted once) and m is the number of paths in Scope with at least 1 Shown_New_Item (D-A). Singular forms SHALL be used for 1 ("1 new video today", "across 1 hobby").
5. IF the Scope holds no Shown_New_Item, or "Saved" is selected, THEN THE header SHALL hide the text of criterion 4 and show no placeholder (decision 5).
6. THE Fresh_Page SHALL keep `fresh` Req 11, criteria 8 and 9: styling only through theme token utilities, no hardcoded color, font, radius or shadow, markup unchanged across themes, no XP on any button or card, YouTube videos only.

### Requirement 2: Filter_Chips

**User Story:** As a learner, I want to narrow the page to one hobby or to my saved videos, so that I find what I need.

#### Acceptance Criteria

1. WHILE the user has 2 or more paths, THE Fresh_Page SHALL show the chips "All hobbies", one Hobby_Chip per path in Path_Order, and "Saved", in that order. Outside this order there SHALL be no other chip; the chip "For <current skill>" no longer exists (decision 3). WHERE Demo_Mode is active, "Saved" SHALL be hidden.
2. THE Fresh_Page SHALL order paths by Path_Order for the Hobby_Chips, the Hobby_Sections and the Sources_Panel groups alike (decision 8).
3. EACH Hobby_Chip SHALL show a dot in its path's `--pursio-hobby-n-deep` color before the label.
4. WHEN a path has 1 or more Shown_New_Items, its Hobby_Chip SHALL show a badge with that count after the label. IF the path has none, THEN THE chip SHALL show no badge. The chip's accessible name SHALL include the hobby and, when shown, "<n> new". The count SHALL be the same number as the path's "n new" badge (Requirement 4, criterion 4).
5. Exactly one chip SHALL be selected at a time, with its selected state exposed to assistive technology. THE page SHALL open with "All hobbies" selected. WHEN the user selects a chip, THE Fresh_Page SHALL update the header, Hero_Card, Hobby_Sections and Sources_Panel default within 200 ms, with no new Fresh_Endpoint request. Selecting a Hobby_Chip SHALL show only that path's Hobby_Section, with the same Carousel. Returning to "All hobbies" SHALL show every path again, with mute changes made since the page opened applied.
6. WHILE the user has exactly 1 path, THE Fresh_Page SHALL show only "All hobbies" and "Saved" (decision 9).
7. WHILE "Saved" is selected, THE Fresh_Page SHALL show the saved videos as `fresh` Req 14, criteria 6 and 7 describe, with no Hero_Card and no Hobby_Section.
8. WHEN the chip row is wider than the main column, THE row SHALL scroll sideways, and every chip SHALL be reachable with Tab and activated with Enter or Space.
9. IF the selected chip's path is no longer in the response, THEN THE Fresh_Page SHALL select "All hobbies".

### Requirement 3: Hero_Card

**User Story:** As a learner, I want the single best video across my hobbies at the top, so that I can start watching in one tap.

#### Acceptance Criteria

1. THE Hero_Card SHALL show the first Shown_Item, in the order of `fresh` Req 9, criterion 5, among the paths in Scope that have a Current_Skill (decision 6, AS3).
2. THE Hero_Card SHALL carry the badge "New today" when its Fresh_Item is a New_Item, and "New this week" otherwise.
3. THE Hero_Card SHALL show a tag with the path's avatar letter, the hobby, the title of the matched Skill and, when that Skill is the path's Current_Skill, the words "your current skill". It SHALL also show the thumbnail, a duration badge, the title, the channel name, the Why_Line (Fresh_Items only), a "Watch" button and, outside Demo_Mode, a "Save" button.
4. IF no Shown_Item qualifies under criterion 1, THEN THE Hero_Card SHALL show the best Video_Pool video of the Current_Skill of the first path in Scope, in Path_Order, that has a Current_Skill and such a video, ranked as in `fresh` Req 12, criterion 2, with its channel not muted. It SHALL carry the badge "Best for your current skill" and no Why_Line.
5. THE video id of the Hero_Card SHALL appear in no Hobby_Section.
6. IF neither criterion 1 nor criterion 4 gives a video, or "Saved" is selected, THEN THE Hero_Card SHALL be hidden with no placeholder.
7. WHEN the user mutes the channel of the Hero_Card video, THE Fresh_Page SHALL stop it if playing and choose the Hero_Card again under criteria 1 to 6, with no new request.
8. "Watch" and "Save" SHALL behave as in `fresh` Req 12, criteria 5 and 6.

### Requirement 4: Hobby_Sections

**User Story:** As a learner, I want each hobby in its own section, so that I see where I am in each one and what is new for it.

#### Acceptance Criteria

1. WHILE a chip other than "Saved" is selected, THE Fresh_Page SHALL show one Hobby_Section per path in Scope, in Path_Order, below the Hero_Card.
2. THE Hobby_Section SHALL use its path's `--pursio-hobby-n` color as background. Its Section_Header SHALL show a round avatar with the first letter of the hobby, upper-cased, on `--pursio-hobby-n-deep` with `--pursio-hobby-n-ink` text, and the hobby name as a heading.
3. WHILE the path has a Current_Skill, THE Section_Header SHALL show the subtitle "You're on <current skill> · <completed> of <total> done" at desktop width and "On <current skill>" at mobile width (decision 10, AS1). <completed> is the number of the path's completed Skills and <total> the number of its Skills. The Skill title SHALL use `--pursio-hobby-n-deep`.
4. WHEN the path has 1 or more Shown_New_Items, THE Section_Header SHALL show a badge "<n> new", where n is the path's number of Shown_New_Items, the Hero_Card video included when it belongs to the path (decision 4, D-A). IF it has none, THEN no badge SHALL show.
5. Each Section_Header SHALL have a heading the Carousel is labeled by, so screen readers announce the hobby for its cards.
6. THE Hobby_Section SHALL show a Carousel (Requirement 6) of its cards (Requirement 5).
7. AT desktop width, THE Section_Header SHALL show an "Open path" button. AT mobile width, the avatar and hobby name SHALL together be one link with a chevron, with an accessible name "Open <hobby> path" (decision 14). Both SHALL set that path as the active hobby and open `/path`, or `/path?demo=1` in Demo_Mode.
8. IF the path has no Current_Skill, THEN THE Hobby_Section SHALL be header-only: avatar, hobby name, the line "Path finished" in place of the subtitle, the path link of criterion 7, and no Carousel and no "n new" badge (decision 11, AS3).
9. IF the path has a Current_Skill but no card is left under Requirement 5, THEN THE Hobby_Section SHALL be header-only with the line "No videos yet" below the subtitle, the path link of criterion 7, and no Carousel (decision 11).

### Requirement 5: Section cards and their order

**User Story:** As a learner, I want new videos for a hobby first and the best known ones after, so that each row always has something good.

#### Acceptance Criteria

1. THE cards of a Hobby_Section SHALL be, in this order: the path's Shown_Items in the order of `fresh` Req 9, criterion 5, then the Video_Pool videos of the path's Current_Window, grouped per Skill in Current_Window order (Current_Skill first) and ranked within a Skill as in `skill-video-pipeline` Requirement 11. Videos whose channel is muted SHALL be left out. Each video id SHALL appear at most once on the page, keeping its first position (the Hero_Card first, then Hobby_Sections in Path_Order).
2. A Fresh_Item card SHALL show the thumbnail, a duration badge, the title, the channel name, the Why_Line, a skill tag and, outside Demo_Mode, a save control. A New_Item card SHALL also show a "New" badge.
3. A Video_Pool card SHALL show the thumbnail, a duration badge, the title, the channel name, a skill tag and, outside Demo_Mode, a save control, with no Why_Line and no "New" badge.
4. THE skill tag SHALL read "<skill title>" when the matched Skill is the path's Current_Skill or outside its Current_Window, and "Next: <skill title>" when it is another Skill of the Current_Window. Its dot SHALL use `--pursio-hobby-n-deep`. Activating it SHALL behave as in `fresh` Req 13, criterion 4.
5. A Hobby_Section SHALL hold at most 12 cards. Across the Hero_Card and all Hobby_Sections, one Skill SHALL have at most 3 cards, counted in display order (Hero_Card, then the section's Fresh_Items, then its Video_Pool videos); a card over the cap SHALL be left out and the next card taken. Under a Hobby_Chip the same caps SHALL apply.
6. THE variety rule of `fresh` Req 9, criteria 13 and 14 (at most 2 cards of one channel in any 6 consecutive cards) SHALL apply to each Hobby_Section after the caps of criterion 5, over the whole section (D-B).
7. A card whose Pool_Language differs from the user's Language_Code SHALL show the language label of `fresh` Req 13, criterion 8.

### Requirement 6: Carousels

**User Story:** As a learner, I want to scroll through a hobby's videos sideways, so that the page stays short and I can still see more.

#### Acceptance Criteria

1. THE Carousel card width SHALL be set so that about 3.3 cards are visible in the main column at desktop width, about 2.3 from 640 px up to 1024 px (AS4) and about 1.6 below 640 px, so that a partly visible card shows the row continues (decision 2).
2. THE Carousel SHALL scroll horizontally with scroll snapping to the start of each card, by touch, trackpad, mouse wheel with Shift, and the arrow buttons.
3. AT desktop width, THE Carousel SHALL show a previous arrow button at its left end and a next arrow button at its right end, each at least 44 by 44 px, with the accessible names "Previous videos in <hobby>" and "Next videos in <hobby>". Each button SHALL be hidden while there is nothing more to scroll in its direction, including when all cards fit. Below desktop width no arrow buttons SHALL show.
4. WHEN the user activates an arrow button, THE Carousel SHALL scroll by the number of fully visible cards, at least 1, and snap to a card (AS5). It SHALL respect `prefers-reduced-motion` by scrolling without animation.
5. EACH card and each control inside it SHALL be reachable with Tab in display order. WHEN a card or one of its controls gets focus, THE Carousel SHALL scroll that card fully into view.
6. Card thumbnails SHALL load lazily, when they come near the visible part of the Carousel.
7. THE Carousel SHALL not scroll the page sideways, and vertical page scrolling SHALL keep working over it.

### Requirement 7: Playback and saving

**User Story:** As a learner, I want to watch and save videos from any row, so that the carousel doesn't get in my way.

#### Acceptance Criteria

1. WHEN the user activates a card or the Hero_Card "Watch" button, THE Fresh_Page SHALL replace that thumbnail with the Embed_Player in place and start playback, and SHALL stop every other video on the page, as in `fresh` Req 13, criteria 6, 7 and 13.
2. WHEN a playing card is scrolled out of view in its Carousel, THE video SHALL keep playing (decision 12). WHEN another video starts, or a chip or mute change removes the playing card from the page, THE Fresh_Page SHALL stop it and flush its progress, as today.
3. Outside Demo_Mode, every card SHALL have a save control with an accessible name including the video title and its saved state, which toggles the save as in `fresh` Req 12, criterion 6 (decision 13).
4. Activating a skill tag SHALL open the Path page as in `fresh` Req 13, criterion 4. Video_Events SHALL be recorded with Source `feed` and change no XP, level or streak, as in `fresh` Req 17.

### Requirement 8: Sources_Panel

**User Story:** As a learner, I want to see which channels Fresh reads for each hobby and turn them off, without a long list in my way.

#### Acceptance Criteria

1. THE Sources_Panel SHALL show the heading "Your sources" and the subtitle "The channels Pursio checks every day, grouped by hobby."
2. THE Sources_Panel SHALL show one group per path in Path_Order, whichever chip is selected. Each group header SHALL show a dot in `--pursio-hobby-n-deep`, the hobby, and "1 channel", "<n> channels" or "none yet", where n is the number of distinct channel ids in the group.
3. WHEN the page opens or a chip is selected, THE group of the selected Hobby_Chip's path SHALL be open; under "All hobbies" or "Saved", the first group SHALL be open. Groups the user opened or closed by hand SHALL keep that state on later chip changes during the visit, apart from the selected chip's group being opened (decision 16).
4. WHEN the user activates a group header with channels, THE group SHALL open or close on its own; several groups MAY be open at once. The header SHALL be a button with a chevron and its expanded state exposed to assistive technology.
5. IF a group has no Channel_Source, THEN its header SHALL show "none yet" with no chevron and SHALL not be expandable.
6. An open group SHALL list its channels and mute switches as in `fresh` Req 15, criteria 1 (order), 2, 6, 7 and 10. A mute change SHALL also update the "new" counts of Requirements 1, 2 and 4 within 200 ms.
7. THE Sources_Panel SHALL end with the line "Videos play from YouTube; nothing is copied." in small text (decision 15).
8. AT desktop width the Sources_Panel SHALL show in the right column at all times. At mobile width it SHALL open in a sheet from the "Sources" button, as in `fresh` Req 15, criterion 5, with the same accordion.
9. IF the user has no paths, THEN the Sources_Panel SHALL not show (`fresh` Req 16, criterion 1).

### Requirement 9: Hobby colors

**User Story:** As a learner, I want each hobby to keep its own color, so that I recognise it at a glance across the page.

#### Acceptance Criteria

1. EVERY theme block in `app/assets/css/themes.css` (trail, boulder, halloween) SHALL define the Hobby_Colors for Color_Slots 1 to 5, and `app/assets/css/main.css` SHALL map them to Tailwind utilities. The `/dev/theme` page SHALL show a swatch for each.
2. IN every theme and for every Color_Slot, the contrast ratio SHALL be at least 4.5:1 for `--pursio-ink` on `--pursio-hobby-n`, for `--pursio-muted` on `--pursio-hobby-n`, for `--pursio-hobby-n-deep` on `--pursio-hobby-n`, and for `--pursio-hobby-n-ink` on `--pursio-hobby-n-deep` (decision 1).
3. Hobby_Section backgrounds, avatars, chip dots, Sources_Panel dots, skill-tag dots and the Hero_Card tag SHALL take their colors from the path's Color_Slot tokens only.
4. WHEN `data-theme` changes, the Hobby_Colors SHALL change only by token values, with the same markup.
5. WHEN a path is created, THE System SHALL assign it the Color_Slot that follows the slot of the user's most recently created path (archived paths included), going from 5 back to 1, or slot 1 when the user has no other path. The slot SHALL be stored with the path: in the local Hobby_Library record and in the cloud `paths` row.
6. A path's Color_Slot SHALL not change when other paths are archived, restored, removed or reordered, when another path becomes active, or when the path itself is archived and restored.
7. A path stored before this change, locally or in the cloud, SHALL get a Color_Slot once, by applying criterion 5 to the user's paths in creation order, and SHALL keep it from then on. Reading the local Hobby_Library SHALL not need a write to give a stable slot for such a record.
8. WHEN a local path is uploaded to the cloud (sign-in or import), its cloud row SHALL keep the local Color_Slot.
9. THE Fresh_Endpoint SHALL return the Color_Slot of each path (`FreshPath.colorSlot`). A signed-out request path SHALL carry its `colorSlot` and `completedCount`; a `colorSlot` that is not an integer from 1 to 5, or a `completedCount` that is not an integer from 0 to the path's Skill count, SHALL return a 400 response naming the field, as `fresh` Req 8 does for other invalid fields. A missing field SHALL be read as slot 1 and 0 completed (D-C). The Demo_Path SHALL use slot 1.

### Requirement 10: Empty, quiet and error states

**User Story:** As a learner, I want a clear message when there is nothing to watch, so that the page never looks broken.

#### Acceptance Criteria

1. With no path, while loading, and after a failed request, THE Fresh_Page SHALL behave as in `fresh` Req 16, criteria 1, 4, 5 and 6.
2. WHILE a chip other than "Saved" is selected, no Fresh_Item is shown in the Hero_Card or any Hobby_Section, and at least one Video_Pool video is shown, THE Fresh_Page SHALL show the line "No new videos today. Here are the best ones for your skills." directly below the Filter_Chips (AS7).
3. WHILE a chip other than "Saved" is selected and no video is shown in the Hero_Card or any Hobby_Section, THE Fresh_Page SHALL show Wick with "No videos yet. Pursio checks for new ones every day." below the Filter_Chips, and SHALL still show each path's header-only Hobby_Section (Requirement 4, criteria 8 and 9) and the Sources_Panel.

### Requirement 11: Demo_Mode

**User Story:** As a visitor, I want to try the new Fresh page without an account, so that I see what Pursio does.

#### Acceptance Criteria

1. WHERE Demo_Mode is active, THE Fresh_Page SHALL show the Demo_Paths with the layout of Requirements 1 to 8, SHALL hide every mute switch, Save button, card save control and the "Saved" chip, SHALL show Sources_Panel groups that can still open and close with channel names only, and SHALL write no Channel_Mute, Video_Event or Save_Snapshot (`fresh` decision D13).
2. WHERE Demo_Mode is active, the path links of Requirement 4, criterion 7 SHALL open `/path?demo=1`.

### Requirement 12: Verification

**User Story:** As a developer, I want tests for the new page rules, so that regressions are caught.

#### Acceptance Criteria

1. THE test suite SHALL verify Path_Order: paths sorted by Active_Time descending, paths with no Active_Time after them in response order, and the same order for Hobby_Chips, Hobby_Sections and Sources_Panel groups.
2. THE test suite SHALL verify the chips: "All hobbies", Hobby_Chips in Path_Order and "Saved"; no "For <current skill>" chip; one path gives only "All hobbies" and "Saved"; Demo_Mode hides "Saved"; a missing selected path falls back to "All hobbies"; chip changes and mute changes send 0 new Fresh_Endpoint requests.
3. THE test suite SHALL verify the "new" counts with a fixed clock: a Fresh_Item published 86399 s before the response counts as new and one published 86400 s before does not; a muted channel's item does not count; a New_Item left out by a cap does not count; a path's count is equal under "All hobbies" and its Hobby_Chip; the Hero_Card video counts once in the header total and in its path's badge; the chip badge equals the section badge; the header text is hidden at 0 and uses singular forms at 1.
4. THE test suite SHALL verify the Hero_Card: the top-ranked Shown_Item across paths in Scope; "New today" under 86400 s, "New this week" from 86400 s to under 604800 s; the fallback "Best for your current skill" from the first path in Path_Order with a Current_Skill and a Video_Pool video; hidden with neither or under "Saved"; muting its channel moves to the next choice; its video id appears in no Hobby_Section; a finished path's Fresh_Items never become the Hero_Card.
5. THE test suite SHALL include a property-based test of at least 100 generated cases of 1 to 5 paths with 0 to 50 Fresh_Items and 0 to 30 Video_Pool videos, asserting that every Hobby_Section holds at most 12 cards, Fresh_Items in their ranked order and, before the variety rule, ahead of every Video_Pool video (D-B), no video id twice on the page, no Skill with more than 3 cards across the Hero_Card and all sections, no muted channel, and the variety rule of `fresh` Req 19, criterion 10 in each section.
6. THE test suite SHALL verify the Section_Header text: "You're on <current skill> · <completed> of <total> done" with the right counts, "Path finished" for a path with no Current_Skill, "No videos yet" for a path with a Current_Skill and no cards, and the skill tag "Next: <title>" only for non-current Skills of the Current_Window.
7. THE test suite SHALL verify the Carousel arrow visibility from scroll position, scroll width and client width: no previous arrow at the start, no next arrow at the end, neither when all cards fit, both in between; and the arrow step of AS5 for 1, 3 and 4 fully visible cards.
8. THE test suite SHALL verify Color_Slot assignment: slots 1, 2, 3 give 4 next; 5 gives 1; no paths give 1; archived paths count; archiving, restoring, removing or reordering other paths leaves every slot unchanged; records without a slot get slots in creation order and the same slots on every read; an upload keeps the local slot; a signed-out request with `colorSlot` 0, 6 or a non-integer, or a `completedCount` below 0 or above the Skill count, returns 400; a request with neither field is read as slot 1 and 0 completed.
9. THE test suite SHALL verify, by parsing `app/assets/css/themes.css`, that every theme defines all 15 Hobby_Colors tokens and that every contrast pair of Requirement 9, criterion 2 is at least 4.5:1.
10. THE test suite SHALL verify the Sources_Panel accordion state: the selected Hobby_Chip's group opens, "All hobbies" and "Saved" open the first group, several groups stay open together, a group with no Channel_Source cannot open, and the channel count text for 0, 1 and 2 channels.
11. THE test suite SHALL verify that a playing video keeps playing after its card is scrolled out of view, stops when another video starts, and stops when a chip or mute change removes its card; and that in Demo_Mode a play, finish and skip write 0 Video_Events, 0 Channel_Mutes and 0 Save_Snapshots.
12. THE existing `fresh` tests that this spec does not replace SHALL keep passing; tests for replaced behaviour (`fresh` Req 19, criteria 11, 13, 19 and 22) SHALL be updated to the rules above.
