# Implementation Plan: Fresh v2

## Overview

The plan follows the module layout of `design.md`. The work is ordered so that each layer can be tested before the next one uses it:

1. The Color_Slot helpers and their storage: local, cloud and database.
2. The two new Fresh_Endpoint fields (`colorSlot`, `completedCount`).
3. The theme tokens.
4. The rewritten view model and its properties.
5. The page and carousel helpers.
6. The components and the page.

Code is TypeScript (strict, no `any`), with `<script setup lang="ts">` for Vue files. Styling uses theme token utilities only, so components contain no hex values. No new dependency is added: tests use the existing Vitest and fast-check. Commands are `yarn typecheck` and `yarn test`.

Test conventions:
- Property tests go in `tests/property/fresh-v2-*.property.test.ts`, each with at least 100 runs and the tag comment `// Feature: fresh-v2, Property N: <title>`.
- Example tests go in `tests/unit/fresh-v2-*.test.ts`.
- Composable and component behavior is tested through pure helpers, because no Nuxt or component test environment exists.

Do not commit. Staging `CHANGELOG.md` triggers an automatic release.

## Tasks

- [x] 1. Color slot helpers
  - [x] 1.1 Implement `shared/utils/color-slot.ts`
    - `COLOR_SLOT_COUNT`, `ColorSlot`, `isColorSlot`, `nextColorSlot` (5 → 1, null → 1), `fillColorSlots` (creation order: `addedAt` then index; keeps valid stored slots), `slotForNewPath` (after the latest-created record, archived ones included)
    - _Requirements: 9.5, 9.7_

- [x] 2. Store the slot with every path
  - [x] 2.1 Local Hobby_Library
    - In `app/utils/hobby-store.ts`, add `colorSlot: ColorSlot` to `HobbyRecord`
    - `parseEntry` reads a valid slot or `null`; `parseHobbyLibrary` fills missing slots with `fillColorSlots` and writes nothing
    - `serializeHobbyLibrary` writes `colorSlot`
    - `addHobby` gives a new entry `slotForNewPath`; a re-added Hobby_Id keeps its slot
    - Check that archive, restore, remove, undo, set-active and legacy migration keep or assign slots as the design says
    - Update `tests/unit/hobby-store.test.ts` fixtures
    - _Requirements: 9.5, 9.6, 9.7_
  - [x] 2.2 Write property test for slot read and write round trip
    - **Property 8: Slot read and write round trip**
    - **Validates: Requirements 9.7, 12.8**
  - [x] 2.3 Cloud rows and library
    - `shared/types/cloud.ts`: add `color_slot` to `PathInsertRow`
    - `app/utils/cloud-rows.ts`: read `color_slot` (nullable, optional); `buildCloudPaths` fills missing slots with `fillColorSlots`; `toPathInsertRow` writes it
    - `app/utils/cloud-api.ts`: add `color_slot` to the path select lists
    - `app/utils/cloud-library.ts`: `upsertGenerated` gives a new path `slotForNewPath` and keeps the slot of a replaced one
    - `app/utils/legacy-import.ts`: the import row carries the local `colorSlot`
    - Update `tests/unit/cloud-rows.test.ts` and `tests/unit/cloud-library.test.ts`
    - _Requirements: 9.5, 9.6, 9.8_
  - [x] 2.4 Write property test for color slot assignment and stability
    - **Property 7: Color slot assignment and stability**
    - Generate sequences of add, re-add, archive, restore, remove, undo and set-active on an in-memory storage; run the same additions through `upsertGenerated`
    - **Validates: Requirements 9.5, 9.6, 12.8**
  - [x] 2.5 Database migration
    - Create `supabase/migrations/20261117000000_path_color_slot.sql`. It adds the `color_slot smallint` column with a 1 to 5 check, backfills it per user in `created_at, id` order with `((n - 1) % 5) + 1`, adds the `assign_path_color_slot()` `before insert` trigger (`security invoker`, `set search_path = public`), sets `not null`, and lists the rollback lines as comments
    - Leave `save_generated_path` unchanged; its conflict branch already keeps `color_slot`
    - Add a contract test next to `tests/unit/fresh-check-store-pg.test.ts` that runs only with the local test database. It checks the backfill order, the trigger's next slot after 5 and after a gap, and that a conflict update keeps the slot
    - Document the migration step in `supabase/README.md`
    - _Requirements: 9.5, 9.6, 9.7_

- [x] 3. Fresh_Endpoint fields
  - [x] 3.1 Add `colorSlot` and `completedCount` to the request and response
    - `shared/types/fresh.ts`: add both fields to `FreshPath` and `FreshRequestPath`
    - `server/utils/fresh/handlers.ts`: validate the fields. A missing field gives slot 1 and 0 completed; an invalid value gives 400 with the field `paths[i].colorSlot` or `paths[i].completedCount`. Copy both into the scope path
    - `server/utils/supabase-server.ts`: select `color_slot`, fall back to `fillColorSlots` for a null value, and count the completed ids that are Skill ids of the tree
    - `app/utils/fresh-request.ts`: `requestPath(id, tree, progress, colorSlot)` sends both fields; `signedOutBody` passes each record's slot; `demoBody` passes 1
    - Update `tests/unit/fresh-request.test.ts`, `tests/unit/fresh-endpoint.test.ts` and the fresh fakes
    - _Requirements: 4.3, 9.9_
  - [x] 3.2 Write property test for request fields
    - **Property 9: Request fields**
    - **Validates: Requirements 9.9, 12.8**

- [x] 4. Hobby color tokens
  - [x] 4.1 Add the tokens and the slot mapping
    - `app/assets/css/themes.css`: add `--pursio-hobby-{1..5}`, `-deep` and `-ink` to boulder, trail and halloween, starting from the hues in the design
    - `app/assets/css/main.css`: map `--color-hobby`, `--color-hobby-deep` and `--color-hobby-ink` in `@theme inline`, plus the `[data-hobby-slot="n"]` blocks
    - `app/pages/dev/theme.vue`: one swatch row per slot
    - _Requirements: 9.1, 9.3, 9.4_
  - [x] 4.2 Extend the contrast test
    - `tests/unit/contrast.test.ts`: each theme defines all 15 hobby variables; for every slot, check `ink` and `muted` on the tint, deep on the tint, and the hobby ink on deep, each at least 4.5:1
    - Tune the token values in 4.1 until the test passes
    - _Requirements: 9.2, 12.9_

- [x] 5. View model
  - [x] 5.1 Rewrite `buildFreshView` in `shared/utils/fresh-view.ts`
    - Types from the design: `FilterChip` without `current`, `ChipView` with `colorSlot` and `newCount`, `HeroView` with `badge` and `path`, `HobbySectionView`, `SectionCardView`, `NewToday`, `SourceGroupView` with `pathId` and `colorSlot`, and `FreshView` with `sections`, `newToday` and `defaultOpenSource`
    - Add `pathOrder`, `freshChips` (v2), `chooseHeroAcross` and `buildSections` (hero first, then the global Skill cap of 3, the 12-card cap, pool fill, variety over the whole section, and the `finished` and `empty` states). Then the "All hobbies" pass, the Hobby_Chip narrowing, the `newToday` counts, `quietLine`, `state` and sources in Path_Order
    - Remove `resolveSelectedPath`, `headerLabel`, `bestPathOrder`, `selectedPathId` and the New and Best section fields
    - Keep `rankFreshItems`, `arrangeVariety`, `tasteAdjustments`, `savedCards`, `freshUpdatedMs`, `relativeTime` and `isAllowedThumbnail`
    - _Requirements: 1.2, 1.4, 1.5, 2.1–2.7, 2.9, 3.1–3.7, 4.1, 4.3, 4.4, 4.8, 4.9, 5.1–5.6, 8.2, 8.3, 10.2, 10.3_
  - [x] 5.2 Write property test for Path_Order
    - **Property 1: Path_Order**
    - **Validates: Requirements 2.2, 4.1, 8.2, 12.1**
  - [x] 5.3 Write property test for the chip set
    - **Property 2: Chip set**
    - **Validates: Requirements 2.1, 2.5, 2.6, 2.9, 11.1, 12.2**
  - [x] 5.4 Write property test for new counts
    - **Property 3: New counts agree**
    - **Validates: Requirements 1.4, 1.5, 2.4, 4.4, 12.3**
  - [x] 5.5 Write property test for section composition
    - **Property 4: Section composition**
    - **Validates: Requirements 3.5, 4.8, 5.1, 5.5, 5.6, 12.5**
  - [x] 5.6 Write property test for the hero choice
    - **Property 5: Hero choice**
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.6, 3.7, 12.4**
  - [x] 5.7 Write property test for section text and tags
    - **Property 6: Section text and tags**
    - **Validates: Requirements 4.3, 5.4, 12.6**
  - [x] 5.8 Write example tests for the view
    - `tests/unit/fresh-v2-view.test.ts`: scenario rows A1–A4, B1–B5, B9 and C1–C6, the hero badges at 86399 s, 86400 s and 604799 s, a New_Item left out by the Skill cap that is not counted, and the singular forms
    - _Requirements: 12.2, 12.3, 12.4, 12.6_
  - [x] 5.9 Update the replaced `fresh` tests
    - Rewrite or remove the v1 rules in the property tests `fresh-chip-scope`, `fresh-header`, `fresh-hero`, `fresh-sections`, `fresh-page-state`, `fresh-sources-panel`, `fresh-no-current-skill` and `fresh-mutes-view`, and in the unit tests `fresh-view.test.ts` and `fresh-view-examples.test.ts`, where a v2 property now covers them
    - Leave the variety, rank, taste, saved-list and server tests unchanged
    - _Requirements: 12.12_

- [x] 6. Page and carousel helpers
  - [x] 6.1 Update `app/utils/fresh-page.ts`
    - `freshPageState` with `sections` in place of the New and Best sections
    - Add `newTodayText`, `pathLink`, `nextOpenGroups` and `toggleGroup` (a group with no entries never opens)
    - Update `tests/unit/fresh-page.test.ts`
    - _Requirements: 1.4, 4.7, 8.3, 8.4, 8.5, 10.1–10.3, 11.2_
  - [x] 6.2 Implement `app/utils/fresh-carousel.ts`
    - `carouselArrows` with the 2 px edge tolerance; `carouselStep` using the fully visible cards, at least 1
    - Add example tests in `tests/unit/fresh-v2-carousel.test.ts` for 1, 3 and 4 fully visible cards
    - _Requirements: 6.3, 6.4, 12.7_
  - [x] 6.3 Write property test for the carousel arrows
    - **Property 10: Carousel arrows**
    - **Validates: Requirements 6.3, 6.4, 12.7**
  - [x] 6.4 Write property test for the sources accordion
    - **Property 11: Sources accordion**
    - **Validates: Requirements 8.3, 8.4, 8.5, 12.10**

- [x] 7. Checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`, and ask the user if questions arise.

- [x] 8. Components
  - [x] 8.1 Add `FreshHobbyAvatar.vue` and `FreshCarousel.vue`
    - Avatar: a letter on `bg-hobby-deep text-hobby-ink`, two sizes, `aria-hidden`
    - Carousel: a scroll `ul` with `snap-x snap-mandatory overscroll-x-contain`, and card widths of about 1.6, 2.3 and 3.3 cards per breakpoint
    - Arrows: prev and next `size-11` buttons from `lg` up, named "Previous videos in <hobby>" and "Next videos in <hobby>", shown or hidden by `carouselArrows` through a passive scroll listener and a `ResizeObserver`
    - Movement: `carouselStep` on press; `focusin` calls `scrollIntoView` with `inline: 'nearest'`; scrolling is instant under `prefers-reduced-motion`
    - The page never scrolls sideways
    - _Requirements: 6.1–6.5, 6.7_
  - [x] 8.2 Update `FreshVideoCard.vue`
    - Always the stack layout
    - Skill tag pill with a `bg-hobby-deep` dot, and "Next: " for the `next` tag
    - "New" badge on the thumbnail; why line for Fresh_Items only
    - Outside Demo_Mode, a small save icon button with `aria-pressed` and a name that includes the title
    - Keep the language label, the thumbnail host check and the skip reporting
    - _Requirements: 5.2, 5.3, 5.4, 5.7, 6.6, 7.1, 7.3_
  - [x] 8.3 Add `FreshHobbySection.vue`
    - A `section` with `data-hobby-slot` and `bg-hobby`, labelled by its `h2`
    - Header: avatar, name, the subtitle in its desktop and mobile variants, and the "n new" badge
    - Path link: "Open path" from `lg` up; below `lg` the avatar and name are a link with a chevron, named "Open <hobby> path"
    - Body: the carousel of cards, or the line "Path finished" or "No videos yet"
    - _Requirements: 4.2–4.9, 11.2_
  - [x] 8.4 Update `FreshHeader.vue`, `FreshFilterChips.vue` and `FreshHeroCard.vue`
    - Header: the "Updated" eyebrow, the title, the right-aligned new-today text from `lg` up, and the "Sources" button below `lg`
    - Chips: one scrolling row; Hobby_Chips with a slot dot and a count badge; `aria-pressed`; an accessible name that includes "<n> new"
    - Hero: the badge text, a hobby tag pill with the avatar, the skill and "your current skill"; Save hidden in Demo_Mode
    - _Requirements: 1.2–1.5, 2.3, 2.4, 2.8, 3.2, 3.3, 3.8_
  - [x] 8.5 Add the Sources accordion
    - `FreshSourcesGroup.vue`: a header button with `aria-expanded` and `aria-controls`, a dot, the hobby, the "1 channel" or "<n> channels" text and a chevron; a plain "none yet" row when the group has no channels; switches outside Demo_Mode
    - `FreshSourcesPanel.vue`: rewritten with the subtitle, the groups, the `open` prop, the `toggle` emit and the closing line "Videos play from YouTube; nothing is copied."
    - `FreshSourcesSheet.vue`: passes `open` and `toggle` through
    - _Requirements: 8.1, 8.2, 8.4–8.8, 11.1_

- [x] 9. Page wiring
  - [x] 9.1 Rewrite the template and state of `app/pages/fresh.vue`
    - Remove `selectedPathId`
    - `chip` starts at "All hobbies"; `shownIds` covers the hero and every section card
    - `openSources` is shared by the panel and the sheet, through `nextOpenGroups` and `toggleGroup`
    - Order: header, chips, quiet or empty line, hero, sections (or the "Saved" grid); the right column holds the Sources_Panel
    - `pathLink` and `skillLink` get the demo flag
    - _Requirements: 1.1, 1.3, 2.5, 2.7, 7.2, 7.4, 8.8, 8.9, 10.1–10.3, 11.1, 11.2_
  - [x] 9.2 Write example tests for playback and Demo_Mode
    - `tests/unit/fresh-v2-actions.test.ts`, using `createFreshActions` with a fake recorder
    - A playing id keeps playing when the shown set is unchanged, and stops when a chip or mute change drops it
    - In demo, a play, a finish and a skip write 0 events, 0 mutes and 0 snapshots
    - _Requirements: 7.2, 11.1, 12.11_

- [x] 10. Change summary and changelog
  - [x] 10.1 Write `.kiro/specs/fresh-v2/changes.md`
    - Groups by purpose (color slots, endpoint fields, tokens, view, carousel, sources, page), with the verification that was run
    - The manual checks: swipe and snap on iOS Safari and Android Chrome, the desktop arrows, Tab through a carousel, reduced motion, the three themes on `/dev/theme`, the mobile Sources sheet, and Demo_Mode
  - [x] 10.2 Add `CHANGELOG.md` entries under "## [Unreleased]"
    - Changed: "Fresh is grouped by hobby, with a scrolling row per hobby and hobby filters (spec: fresh-v2)"
    - Added: "Each hobby keeps its own color across the app's Fresh page (spec: fresh-v2)"
    - Do not commit

- [x] 11. Final checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`, and ask the user if questions arise.

## Notes

- Every design property (1 to 11) has its own property test sub-task. Property tests use fast-check with at least 100 runs.
- The migration contract test (2.5) is skipped without a local test database. No test uses the production database or the network.
- Exact token values are tuned in 4.1 against the contrast test in 4.2; the design's hex values are starting points.
- Carousel swiping, snapping and focus scrolling can only be checked by hand (10.1).
- No new dependency is added. Real env files are never read.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1", "6.2"] },
    { "id": 1, "tasks": ["2.1", "2.5", "3.1", "4.2", "6.3"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2"] },
    { "id": 3, "tasks": ["2.4", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.8", "5.9", "6.1"] },
    { "id": 5, "tasks": ["6.4", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.4", "8.5"] },
    { "id": 7, "tasks": ["8.3"] },
    { "id": 8, "tasks": ["9.1"] },
    { "id": 9, "tasks": ["9.2", "10.1"] },
    { "id": 10, "tasks": ["10.2"] }
  ]
}
```
