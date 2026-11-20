# Changes: Path labels and side quests overlap

The owner reported on 2026-11-20 (screenshot, desktop, center column about 454 px) that texts and nodes overlap on the path wherever a side quest hangs off the trail.

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Status:** 1 of 1 done
- **Size:** 8 files changed, 1 added, in 1 group

## Scenarios

| ID | Starting state | Action | Expected result | Bug | Status |
|---|---|---|---|---|---|
| S1 | Two side quests hang off neighbouring main nodes, each with a two-line title | Open the path | The second side quest node sits fully below the first one's label | APP-PATH-02 | Done |
| S2 | A side quest hangs off a main node; the next main node has a two-line title | Open the path | The side quest's label and the next main node's label do not touch | APP-PATH-02 | Done |
| S3 | Same as S2 | Open the path | No branch dot sits on the main node's title or status line | APP-PATH-02 | Done |
| S4 | A side quest with a very long title, 320 px wide screen | Open the path | The title is cut after two lines with "…"; nothing below it is covered | APP-PATH-02 | Done |
| S5 | A path with no side quests | Open the path | Every node is exactly where it is today | — | Done |
| S6 | A side quest hangs off the last main node of a section | Open the path | It stays clear of the next section header | — | Done (changed, see Watch for) |
| S7 | A side quest depends on another side quest | Open the path | Both sit in the same gap, the dependent one below | APP-PATH-02 | Done |

## Review order

1. G1 is the only group. Read [path-layout.ts](../../app/utils/path-layout.ts) first, then the property test for Property 19, which states the guarantee.

## Groups

### G1. A side quest and its label get their own space (APP-PATH-02, S1–S7)

**Cause:** the layout knew node boxes but not labels.

1. It reserved 40/44 px below a side quest; the real label (gap, two title lines, status line) is 64/70 px, so the next side quest was placed 20 to 30 px too high (S1).
2. It centered the side quest between its prerequisite and the next main node. The node fitted between the two main labels, but its label landed at the height of the next main label, and the two overlap sideways unless the next main node is the far-left one of the winding (S2). Property 19 only checked node boxes.
3. Branch dots ran from the main node's center to the side quest's center, through the main node's label (S3).

**Approach:** a main node with side quests gets a taller gap below it: its own label reach, the stacked side quest footprints (box + label), then the next main node's label reach. Mobile 208 px instead of 112 for one side quest, desktop 226 instead of 124; each further side quest in the same gap adds 140/154 px. Titles are clamped so the reserved heights always hold. This works at every column width because it never depends on label widths.

| File | Why it changed |
|---|---|
| [app/utils/path-layout.ts:92-115](../../app/utils/path-layout.ts#L92-L115) | `sideLabelReserve` is now the real label height (64/72); new `mainLabelReach` (40/42) |
| [app/utils/path-layout.ts](../../app/utils/path-layout.ts) `placePath` steps 2–4 | Works out which main node each side quest hangs from, widens the gap below that node (or the section tail, for a section's last node), and puts the side quest at the top of that gap |
| [app/utils/path-layout.ts](../../app/utils/path-layout.ts) `trailStart` | The branch from a main node to a side quest starts at the node's lower edge, so its dots run below the label |
| [app/components/path/PathNodeLabel.vue](../../app/components/path/PathNodeLabel.vue) | Title clamped to 2 lines below a side quest and 3 beside a main node, so a label is never taller than the layout reserves |
| [tests/unit/path-layout.test.ts](../../tests/unit/path-layout.test.ts) | New fixed numbers; regression tests for S1/S6 (stack before a header), S2, S5, S7 and the branch start |
| [tests/property/path-layout.property.test.ts](../../tests/property/path-layout.property.test.ts) | Property 19 now also checks side quest footprints against main label bands, each other and headers; Properties 16, 17 and 21 follow the new rules |
| [.kiro/specs/skill-path-ui/requirements.md](../specs/skill-path-ui/requirements.md) | Req 5.4 (row gap grows for side quests), 5.5 (between the labels, not the midpoint), 6.1 (branch start) |
| [.kiro/specs/skill-path-ui/design.md](../specs/skill-path-ui/design.md) | Config table, `placePath` steps, Properties 16, 17, 19 |
| [CHANGELOG.md](../../CHANGELOG.md), [KNOWN_BUGS.md](../../KNOWN_BUGS.md) | User-facing line; ledger entry under Fixed |

- **Must not change:** a path with no side quests keeps every position (S5, unit test and Property 16); main-node order and winding offsets; dots at 28/50/72 % on every segment; side quests at +110/+170 px.
- **Related, not changed:** [app/components/path/PathCanvas.vue](../../app/components/path/PathCanvas.vue) (its `METRICS.sideGap` 10/12 is part of the 64/72 reserve; if that gap or the label font sizes change, the two config values must follow), [app/components/path/PathTrail.vue](../../app/components/path/PathTrail.vue), [app/composables/usePathLayout.ts](../../app/composables/usePathLayout.ts).
- **Watch for:**
  - The path is taller: about 96 px (mobile) or 102 px (desktop) per side quest, more than the "about 80 px" the plan said. Three-line main titles needed the extra reach.
  - S6 changed behaviour: side quests of a section's last main node used to be pushed below the next section header. They now stay in their own section, and the header moves down.
  - A side quest with several prerequisites follows the latest main node among them. Before, it followed the lowest prerequisite, which is the same node in almost every tree.
  - The label heights are computed from the Tailwind classes, not measured in a browser.

## Decisions

1. **How to make room for the side quest label?** Decided 2026-11-20: A, a taller row below a main node with side quests. Affects S2, S3.
2. **Clamp long titles with "…"?** Not answered separately; A needs it, so it was done as recommended: two lines under a side quest, three beside a main node. The full title stays in the detail panel and the button's accessible name. Affects S4.

## Not changed on purpose

- Dots between two side quests (S7) still run center to center, through the upper one's label. Both sit in the same column, so there is no clear route around the label; see Follow-ups.
- The branch to a side quest from a prerequisite that is not the node it hangs from (a side quest with two main prerequisites) still crosses whatever lies between.
- `tasks.md` of `skill-path-ui` still says "midpoint"; it is the record of the original work.

## Verification

- **Run:** `yarn vitest run`: 128 files passed, 1 skipped; 1244 tests passed, 16 skipped. `yarn nuxt typecheck`: no errors.
- **Not run:** lint (the project has no ESLint); the app was not started, so nothing was checked in a browser.

## Manual checks before release

- [ ] S1–S3: open the sandwich path from the screenshot on desktop at the same width; no label touches a node, another label or a dot.
- [ ] S4: same path at 320 px and 390 px; long side quest titles end in "…".
- [ ] S5: a section without side quests looks unchanged.
- [ ] The "NEXT UP" tag and progress ring on a current node right below a side quest do not touch the side quest's label.

## Follow-ups

- Decide what the link between two stacked side quests should look like (S7): no dots, or dots beside the label.
