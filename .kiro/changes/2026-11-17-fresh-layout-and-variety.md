# Changes: Fresh chip order, 3 videos per skill, centered page

Reported by the owner on 2026-11-17 with a desktop screenshot: "All skills" must be the leftmost chip, a skill (topic) shows at most 3 videos, and the Fresh page is centered like the other pages. Ledger: APP-FRESH-01 (variety), APP-FRESH-04 (chip order, new), APP-FRESH-05 (page not centered, new).

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Status:** 3 of 4 done (G4 planned, waiting for a decision)
- **Size:** 10 files changed, 1 added (this file), in 3 groups

## Scenarios

| ID | Starting state | Action | Expected result | Bug | Status |
|---|---|---|---|---|---|
| S1 | Signed in, path with a current skill | Open Fresh | Chips read "All skills", "For <current skill>", one per hobby, "Saved" | APP-FRESH-04 | Done |
| S2 | Path with no current skill (completed) | Open Fresh | "All skills" first, no "For" chip (must stay) | | Done |
| S3 | "All skills" or a path chip, a skill has 4+ videos | Open Fresh | At most 3 videos of that skill on the page, counted Hero, New, Best | APP-FRESH-01 | Done |
| S4 | "All skills", the 3-per-skill cap leaves room | Open Fresh | Best_Section fills from the next window skills, up to 12 cards (must stay) | | Done |
| S5 | "For <current skill>" chip | Select it | Every video of that skill, no cap | APP-FRESH-01 | Done |
| S6 | Desktop, wide window | Open Fresh | Main column and Sources panel sit centered with the same max width as Quests and Profile | APP-FRESH-05 | Done |
| S7 | Mobile | Open Fresh | Layout unchanged; Sources sheet still opens from the header (must stay) | | Done |
| S8 | "All skills", 3+ hobbies, Selected_Path Meditation | Open Fresh | Best mixes hobbies near the top instead of 8 Meditation cards first (decision 3) | APP-FRESH-06 | Planned |

## Review order

1. G2: the cap is the only logic change; read the code before the test model.
2. G1, G3: small.

## Groups

### G1. "All skills" first (APP-FRESH-04, S1, S2)

**Cause:** `freshChips` pushed "For <current skill>" before "All skills", as Req 14.1 said.

| File | Why it changed |
|---|---|
| [shared/utils/fresh-view.ts:161-174](../../shared/utils/fresh-view.ts#L161-L174) | "All skills" is pushed first |
| [.kiro/specs/fresh/requirements.md](../specs/fresh/requirements.md) | Req 14.1 order |
| [tests/unit/fresh-page.test.ts](../../tests/unit/fresh-page.test.ts), [tests/unit/fresh-view-examples.test.ts](../../tests/unit/fresh-view-examples.test.ts) | Expected chip order |

### G2. At most 3 videos per skill (APP-FRESH-01, S3 to S5)

**Cause:** the Best_Section walked each window skill's pool and took every video until 12 cards; the variety rule only limits channels. **Change:** a per-skill counter over the page in display order. The hero counts first, New skips items whose chosen skill is full, and Best stops a skill at 3 and moves to the next. Off under "For <current skill>".

| File | Why it changed |
|---|---|
| [shared/utils/fresh-rank.ts](../../shared/utils/fresh-rank.ts) | `MAX_PER_SKILL = 3` |
| [shared/utils/fresh-view.ts](../../shared/utils/fresh-view.ts) | Counter seeded by the hero; New built in a loop so only shown cards use slots; Best checks the counter |
| [tests/property/fresh-sections.property.test.ts](../../tests/property/fresh-sections.property.test.ts) | Model of Best takes the slots used by hero and New; new assertion of at most 3 per skill; exact New count only under "current"; the taste test (Req 9.9) now compares Best only when hero and New use the same slots |
| [tests/unit/fresh-view-examples.test.ts](../../tests/unit/fresh-view-examples.test.ts) | Examples: display order, free slots to the next skill, path chip, no cap under "current" |
| [.kiro/specs/fresh/requirements.md](../specs/fresh/requirements.md) | Decision D17, Req 9.16, references in 13.1 and 13.5, test criterion 19.22 |
| [.kiro/specs/fresh/design.md](../specs/fresh/design.md) | Steps 5 and 6 of `buildFreshView` |

- **Must not change:** hero choice, dedupe across sections, NEW_MAX 24, BEST_MAX 12, variety rule, mutes.
- **Watch for:** taste now reaches Best indirectly: a liked channel can move a New card onto a skill and take one of its Best slots. Req 9.9 still holds for Best's own order.

### G3. Center the page (APP-FRESH-05, S6, S7)

| File | Why it changed |
|---|---|
| [app/pages/fresh.vue](../../app/pages/fresh.vue) | Wrapper gets `mx-auto w-full max-w-360` like Quests and Profile; `main` drops `lg:mx-0` and fills its column on desktop (`lg:max-w-none`) |

- **Not changed:** card and hero card layout (APP-FRESH-02, 03), a separate task.

### G4. Mix hobbies in the Best_Section (APP-FRESH-06, S8) — planned

**Cause:** Req 9.11 orders the Best_Section path by path: the Selected_Path's whole Current_Window (3 skills × 3 cards, minus the hero) comes before any other hobby, so with BEST_MAX 12 only 3 or 4 cards are left for the other hobbies, at the bottom ([fresh-view.ts](../../shared/utils/fresh-view.ts), `bestPathOrder` and the Best loop). **Planned change:** depends on decision 3.

## Decisions

1. **What counts toward the 3?** Decided 2026-11-17 by the owner: the whole page, in display order Hero, New, Best, so new videos use a skill's slots first. Free slots go to the next skills.
2. **Cap under "For <current skill>"?** Decided 2026-11-17 by the owner: no cap there; it applies under "All skills" and the path chips.

3. **How should "All skills" mix hobbies in Best?** Open. (a) Round-robin by window position: current skill of each path (Selected_Path first), then the 2nd window skill of each path, and so on, up to 3 cards per skill as now. (b) Round-robin by card: one card per path in turn. (c) Keep path by path. Recommendation: (a); every hobby's current skill shows in the first rows and skills stay grouped. Affects S8. Path chips and "For <current skill>" are unchanged by any option.

## Verification

- **Run:** `yarn test` 1062 passed, 11 skipped, 0 failed (4 new example tests). `yarn typecheck` clean. `yarn build` succeeds.
- **Not run:** no visual check in a browser.

## Manual checks before release

- [ ] S1: chips start with "All skills".
- [ ] S3: under "All skills" no skill tag appears more than 3 times, hero included.
- [ ] S5: "For <current skill>" shows more than 3 when the pool has them.
- [ ] S6: on a wide desktop window the page is centered like Quests.
- [ ] S7: mobile layout and the Sources sheet unchanged.
