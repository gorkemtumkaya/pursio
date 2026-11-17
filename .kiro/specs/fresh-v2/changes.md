# Changes: Fresh v2 (grouped by hobby)

The Fresh page is rebuilt around hobbies: one tinted section per path with a carousel, hobby chips, a cross-hobby hero and an accordion Sources panel. Each path stores a color slot. Reasoning is in [requirements.md](requirements.md) and [design.md](design.md); the tasks are in [tasks.md](tasks.md).

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted. Do not stage `CHANGELOG.md` until you want the release: the pre-commit hook releases it.
- **Size:** 45 files changed, 23 added, 8 deleted, in 8 groups

## Review order

1. G1 Color slots: everything else reads `colorSlot`.
2. G2 Endpoint fields: the response shape the view depends on.
3. G4 View model: the rules of the page. Read it with its tests.
4. G3 Tokens, G5 Carousel, G6 Sources, G7 Page: the visible part.
5. G8 Tests removed and replaced.

## Groups

### G1. Color slots (Req 9.5 to 9.8; G1 to G4)

One rule (`nextColorSlot`) used where a path is created: locally in `addHobby`, in the cloud by a trigger, and in the client list by `upsertGenerated`.

| File | Why it changed |
|---|---|
| [shared/utils/color-slot.ts](../../../shared/utils/color-slot.ts) | New. `isColorSlot`, `nextColorSlot`, `fillColorSlots`, `slotForNewPath` |
| [app/utils/hobby-store.ts](../../../app/utils/hobby-store.ts) | `HobbyRecord.colorSlot`; a missing slot is derived on read in `addedAt` order and written on the next write; `addHobby` assigns, a re-added hobby keeps its slot |
| [app/utils/cloud-rows.ts](../../../app/utils/cloud-rows.ts) | Reads `color_slot` without ever dropping a row; `buildCloudPaths` fills missing ones; `toPathInsertRow` sends it so Undo keeps the color |
| [app/utils/cloud-library.ts](../../../app/utils/cloud-library.ts) | `upsertGenerated` gives a new path the next slot and keeps the slot of a replaced one |
| [app/utils/cloud-api.ts](../../../app/utils/cloud-api.ts) | `color_slot` in the path select list |
| [app/utils/legacy-import.ts](../../../app/utils/legacy-import.ts) | The import row carries the local slot; the old Generated_Tree, which has none, follows the row before it |
| [shared/types/cloud.ts](../../../shared/types/cloud.ts) | `PathInsertRow.color_slot` (optional: left out, the trigger assigns) |
| [supabase/migrations/20261117000000_path_color_slot.sql](../../../supabase/migrations/20261117000000_path_color_slot.sql) | New. Column with a 1 to 5 check, backfill per user in `created_at, id` order, `before insert` trigger, `not null`, rollback lines |
| [supabase/README.md](../../../supabase/README.md) | Migration step 11 and the rollout order |
| Tests: [color-slot.test.ts](../../../tests/unit/color-slot.test.ts), [path-color-slot-db.test.ts](../../../tests/unit/path-color-slot-db.test.ts), [fresh-v2-color-slot.property.test.ts](../../../tests/property/fresh-v2-color-slot.property.test.ts) (Property 7), [fresh-v2-slot-roundtrip.property.test.ts](../../../tests/property/fresh-v2-slot-roundtrip.property.test.ts) (Property 8), [hobby-store.test.ts](../../../tests/unit/hobby-store.test.ts), [cloud-rows.test.ts](../../../tests/unit/cloud-rows.test.ts), [cloud-library.test.ts](../../../tests/unit/cloud-library.test.ts), [legacy-import.test.ts](../../../tests/unit/legacy-import.test.ts), [legacy-import.property.test.ts](../../../tests/property/legacy-import.property.test.ts), [arbitraries.ts](../../../tests/arbitraries.ts), [profile-stats.test.ts](../../../tests/unit/profile-stats.test.ts), [quest-rules.test.ts](../../../tests/unit/quest-rules.test.ts) | New slot cases, and `colorSlot` in the existing fixtures |

- **Related, not changed:** [supabase/migrations/20261110000000_goal_language.sql](../../../supabase/migrations/20261110000000_goal_language.sql) (`save_generated_path`: its conflict branch does not list `color_slot`, which is what keeps the slot on a re-generated path).
- **Watch for:** apply the migration **before** deploying. The client and the server now select `paths.color_slot`, so a database without the column fails every path load. The design's "a client before the migration still works" does not hold for that reason; the README says so.
- **Watch for:** two devices creating paths at the same moment can get the same slot (accepted in the design).

### G2. Endpoint fields `colorSlot` and `completedCount` (Req 4.3, 9.9)

| File | Why it changed |
|---|---|
| [shared/types/fresh.ts](../../../shared/types/fresh.ts) | Both fields on `FreshPath` and `FreshRequestPath` |
| [server/utils/fresh/handlers.ts](../../../server/utils/fresh/handlers.ts) | Signed-out body: missing reads as slot 1 and 0 completed, invalid returns 400 with `paths[i].colorSlot` or `paths[i].completedCount` |
| [server/utils/supabase-server.ts](../../../server/utils/supabase-server.ts) | Signed in: selects `color_slot`, counts completed ids that are Skills of the tree |
| [app/utils/fresh-request.ts](../../../app/utils/fresh-request.ts) | `requestPath(…, colorSlot)` sends both; the Demo_Path sends slot 1 |
| [app/utils/fresh-api.ts](../../../app/utils/fresh-api.ts) | Parses both; a response without them reads as 1 and 0 instead of failing the page |
| Tests: [fresh-v2-request-fields.property.test.ts](../../../tests/property/fresh-v2-request-fields.property.test.ts) (Property 9), [fresh-endpoint.test.ts](../../../tests/unit/fresh-endpoint.test.ts), [fresh-request.test.ts](../../../tests/unit/fresh-request.test.ts), [fresh-client.ts](../../../tests/support/fresh-client.ts), [fresh-route-fakes.ts](../../../tests/support/fresh-route-fakes.ts) | New cases and fixtures |

- **Watch for:** the new field names use brackets (`paths[0].colorSlot`), as the design says; the older fields use dots (`paths.0.id`).

### G3. Hobby color tokens (Req 9.1 to 9.4)

| File | Why it changed |
|---|---|
| [app/assets/css/themes.css](../../../app/assets/css/themes.css) | 15 variables per theme (tint, deep, ink for slots 1 to 5) |
| [app/assets/css/main.css](../../../app/assets/css/main.css) | `bg-hobby`, `bg-hobby-deep`, `text-hobby-deep`, `text-hobby-ink`, chosen by `[data-hobby-slot]`; the `scrollbar-themed` utility |
| [app/pages/dev/theme.vue](../../../app/pages/dev/theme.vue) | One swatch row per slot |
| [tests/unit/contrast.test.ts](../../../tests/unit/contrast.test.ts) | All 15 tokens in each theme; four pairs per slot at 4.5:1 |

- **Watch for:** the boulder values are the design's starting points and passed unchanged. Trail and halloween values are mine; look at them on `/dev/theme`.

### G4. View model (Req 1 to 5, 8, 10)

| File | Why it changed |
|---|---|
| [shared/utils/fresh-view.ts](../../../shared/utils/fresh-view.ts) | Rewritten: `pathOrder`, chips without "For <skill>", `chooseHeroAcross`, `buildSections`, new counts, sources per path, `defaultOpenSource`. `resolveSelectedPath`, `headerLabel`, `chooseHero` and `selectedPathId` are gone |
| [shared/utils/fresh-rank.ts](../../../shared/utils/fresh-rank.ts) | `SECTION_MAX = 12` replaces `NEW_MAX` and `BEST_MAX` |
| [app/utils/fresh-page.ts](../../../app/utils/fresh-page.ts) | `freshPageState` with `sections`; `newTodayText`, `channelCountText`, `pathLink`, `nextOpenGroups`, `toggleGroup` |
| Tests: Properties 1 to 6 and 11 in `tests/property/fresh-v2-*.property.test.ts` ([path-order](../../../tests/property/fresh-v2-path-order.property.test.ts), [chips](../../../tests/property/fresh-v2-chips.property.test.ts), [new-counts](../../../tests/property/fresh-v2-new-counts.property.test.ts), [sections](../../../tests/property/fresh-v2-sections.property.test.ts), [hero](../../../tests/property/fresh-v2-hero.property.test.ts), [section-text](../../../tests/property/fresh-v2-section-text.property.test.ts), [sources-accordion](../../../tests/property/fresh-v2-sources-accordion.property.test.ts)), [fresh-v2-view.test.ts](../../../tests/unit/fresh-v2-view.test.ts) (scenario rows), [fresh-view.test.ts](../../../tests/unit/fresh-view.test.ts), [fresh-page.test.ts](../../../tests/unit/fresh-page.test.ts), [fresh-arbitraries.ts](../../../tests/support/fresh-arbitraries.ts) | See G8 |

- **Watch for:** three places where I had to settle something the design leaves open. See Decisions 1 to 3.

### G5. Carousel (Req 6)

| File | Why it changed |
|---|---|
| [app/utils/fresh-carousel.ts](../../../app/utils/fresh-carousel.ts) | New. `carouselArrows` (2 px tolerance), `carouselStep` |
| [app/components/fresh/FreshCarousel.vue](../../../app/components/fresh/FreshCarousel.vue) | New. CSS scroll and snap; script only for the arrows, the step and focus scrolling |
| [app/components/fresh/FreshHobbyAvatar.vue](../../../app/components/fresh/FreshHobbyAvatar.vue) | New. Letter avatar |
| [app/components/fresh/FreshHobbySection.vue](../../../app/components/fresh/FreshHobbySection.vue) | New. Tinted section, header, path link, carousel or the header-only line |
| [app/components/fresh/FreshVideoCard.vue](../../../app/components/fresh/FreshVideoCard.vue) | Always stacked; "New" on the thumbnail; tag pill with the hobby dot and "Next: "; icon save button |
| [app/components/fresh/FreshSaveButton.vue](../../../app/components/fresh/FreshSaveButton.vue) | `icon` size, named "Save <title>" or "Remove <title> from saved" |
| Tests: [fresh-v2-carousel.property.test.ts](../../../tests/property/fresh-v2-carousel.property.test.ts) (Property 10), [fresh-v2-carousel.test.ts](../../../tests/unit/fresh-v2-carousel.test.ts) | |

- **Related, not changed:** [app/components/watch/WatchVideoCard.vue](../../../app/components/watch/WatchVideoCard.vue) (lazy thumbnails and skip reporting come from here).
- **Watch for:** the section heading is one visually hidden `h2`; the visible name is a link below `lg` and hidden from assistive technology from `lg`, so the hobby is announced once at both widths.

### G6. Sources accordion (Req 8)

| File | Why it changed |
|---|---|
| [app/components/fresh/FreshSourcesGroup.vue](../../../app/components/fresh/FreshSourcesGroup.vue) | New. Header button with `aria-expanded`, or a plain "none yet" row |
| [app/components/fresh/FreshSourcesPanel.vue](../../../app/components/fresh/FreshSourcesPanel.vue) | Rewritten: subtitle, groups, closing line; `open` prop and `toggle` emit |
| [app/components/fresh/FreshSourcesSheet.vue](../../../app/components/fresh/FreshSourcesSheet.vue) | Passes the open groups and `toggle` through (the prop is `openGroups`, because `open` is the sheet itself) |

### G7. Page, header, chips, hero (Req 1 to 3, 7, 10, 11)

| File | Why it changed |
|---|---|
| [app/pages/fresh.vue](../../../app/pages/fresh.vue) | No Selected_Path; sections in place of the two lists; shared accordion state; `pathLink` |
| [app/components/fresh/FreshHeader.vue](../../../app/components/fresh/FreshHeader.vue) | "Updated" eyebrow, new-today text from `lg` |
| [app/components/fresh/FreshFilterChips.vue](../../../app/components/fresh/FreshFilterChips.vue) | Toggle buttons with `aria-pressed` (was a radio group with arrow keys), dot and count badge |
| [app/components/fresh/FreshHeroCard.vue](../../../app/components/fresh/FreshHeroCard.vue) | Badge text, hobby tag pill, two columns from `lg` |
| Tests: [fresh-v2-actions.test.ts](../../../tests/unit/fresh-v2-actions.test.ts), [conventions.test.ts](../../../tests/unit/conventions.test.ts) | Playback across carousels, Demo_Mode writes nothing; the new components are in the token scan |

### G8. Tests of replaced rules (Req 12.12)

- Removed, covered by Properties 1 to 6 and 11: `fresh-chip-scope`, `fresh-header`, `fresh-hero`, `fresh-sections`, `fresh-page-state`, `fresh-sources-panel`, `fresh-mutes-view` (property) and `fresh-view-examples` (unit; its taste and Skill cap examples moved into `fresh-view.test.ts`).
- Kept and updated: [fresh-no-current-skill.property.test.ts](../../../tests/property/fresh-no-current-skill.property.test.ts). Its server checks are unchanged; its page part now expects a `finished` section.
- Unchanged: variety, rank, taste, saved-list and every server test.

## Decisions

Made while implementing, 2026-11-17. Each is easy to reverse; say so if you want another rule.

1. **A video that is both a Fresh_Item and a pool video shows as the Fresh_Item.** A pool copy is skipped even when its section comes first. Req 5.1 says "keeping its first position"; with that rule a pool card in an earlier section could hide a new video and make the counts differ between chips.
2. **Under a hobby chip, a new video that "All hobbies" does not show is left out.** With more than 12 cards the chip view has room for one more (its own hero plus 12). Showing a 13th new video there would break D-A ("the count is the same under both chips"). Older videos and pool videos still fill that place.
3. **One Sources group per path, keyed by path id.** The old code merged paths whose hobby text normalizes the same. Req 8.2 says one group per path.
4. **Sources opening is applied when the page loads and in the chip handler**, not by a watcher on the view as the design says. A watcher would reopen a group the user closed whenever a mute recomputed the view.
5. **`freshChips` returns "All hobbies" (and "Saved") with 0 paths**, as Property 2 states. The page shows no chips then anyway.

## Not changed on purpose

- [KNOWN_BUGS.md](../../../KNOWN_BUGS.md): it has an uncommitted edit that is not mine (APP-FRESH-07), so I left the file alone. See Follow-ups.
- [app/components/fresh/FreshSection.vue](../../../app/components/fresh/FreshSection.vue) and `FreshState.vue`: still used for the "Saved" grid and the state lines.
- No local "last opened" time for signed-out paths (AS2).

## Verification

- **Run:** `yarn test`: 127 files passed, 1 skipped; 1223 tests passed, 16 skipped (before: 119 files, 1062 tests). `yarn typecheck`: clean.
- **Run:** each of Properties 3 and 4 was checked against deliberate faults in `fresh-view.ts` (no variety, hero not counted in the cap, mutes ignored in the pool, 25 h "new" window, no fresh-over-pool rule, no chip-count rule). All six were caught, the last one only after I added a generator for hobbies with more than 12 new videos.
- **Run:** headless Chrome screenshots of `/dev/theme` (boulder) and of the components with fixture data at 1440 px and 520 px, through a temporary dev page that is deleted again. `/fresh?demo=1` on the local dev server returned no videos, so it showed only the empty state.
- **Not run:** the live part of `path-color-slot-db.test.ts` (5 tests, skipped without a local Supabase). The migration has not been applied to any database. The backfill order is checked on the SQL text only.
- **Not run:** no component tests exist. The scrollbar style was not looked at in a browser with always-visible scrollbars.

## Manual checks before release

- [ ] Apply the migration on a copy first; check that existing paths get 1, 2, 3… per user in creation order and that a new path gets the next slot.
- [ ] F4: swipe and snap on iOS Safari and Android Chrome; about 1.6 cards show; the page does not scroll sideways.
- [ ] F1 to F3: desktop arrows appear and hide at the ends; a press moves by the fully visible cards.
- [ ] F5: Tab through a carousel; the focused card scrolls into view.
- [ ] Reduced motion: an arrow press jumps without animation.
- [ ] B8: `/dev/theme` in trail, boulder and halloween; then a Fresh page in halloween.
- [ ] Scrollbars of the carousels and the chip row in all three themes.
- [ ] E6: mobile Sources sheet opens with the same groups open; Escape returns focus to "Sources".
- [ ] D2: play a card, scroll it away (keeps playing), start another (first stops), select another hobby chip (stops).
- [ ] `/fresh?demo=1`: no "Saved" chip, no save controls, no switches; "Open path" goes to `/path?demo=1`.

## Follow-ups

- `KNOWN_BUGS.md`: APP-FRESH-06 (Best_Section order) no longer applies, because the Best_Section is gone. APP-FRESH-02 and APP-FRESH-03 (card and hero layout) should be re-checked against the v2 mockups and closed or rewritten.
- `.kiro/changes/2026-11-17-fresh-layout-and-variety.md` plans work on the v1 layout; most of it is superseded.
- This project has no copies of the process rules. Run `~/workbench/sync-steering.sh` for it and add the imports it prints.
