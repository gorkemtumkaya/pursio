# Changes: finish line card on the path

The owner asked on 2026-11-23 to add the finish line to the path, after the designs `Finish line card · three states · Desktop@1x.png` and `· Mobile@1x.png` in `dev_docs/` (that folder is not in git). Until now the finish line showed only on the ready card of `/new` (spec: [path-intake](../specs/path-intake/requirements.md), Requirement 12) and as the title of the last node.

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Size:** 5 files changed, 4 added, in 3 groups

## Review order

1. G1: the state and the text of the card. G2 only draws what it returns.
2. G2: the card.
3. G3: where it sits and where its data comes from.

## Groups

### G1. State and text of the card

A pure function gives the state from the tree and the Progress, so the card follows a completion, a reset and a restore in the same render, like the header stats.

| File | Why it changed |
|---|---|
| [app/utils/finish-line.ts](../../app/utils/finish-line.ts) | New. `finishLineView` (state, counts, percent, next milestone, day reached) and `FINISH_LINE_COPY` (every string of the card) |
| [tests/unit/finish-line.test.ts](../../tests/unit/finish-line.test.ts) | New. The three states, side quests, Known_Nodes, the date, the singular "1 skill" |

- **Related, not changed:** [shared/utils/progress-engine.ts](../../shared/utils/progress-engine.ts) (`effectiveCompleted`: Known_Nodes count as done), [shared/utils/skill-tree-load.ts:18](../../shared/utils/skill-tree-load.ts#L18) (`finalNode`: the place of the finish line), [app/utils/section-headers.ts](../../app/utils/section-headers.ts) (the section banner counts Main_Nodes the same way).
- **Watch for:**
  - "Skills" on the card are Main_Nodes. Side quests are not counted, so a reached card reads "12 of 12" even with an open side quest. The ready card of `/new` counts every node, so its "skills" number is higher on a path with side quests.
  - A path with known skills starts as "in progress" (for example "2 of 12 skills"), never as "not started", because Known_Nodes are completed from the start.
  - "Next milestone" names the next open milestone before the last node. When only the finish line itself is left, the line is hidden.

### G2. The card

| File | Why it changed |
|---|---|
| [app/components/path/PathFinishLine.vue](../../app/components/path/PathFinishLine.vue) | New. The three states of the design. It switches between the mobile and the desktop layout by the width of its own column (container query at 512 px), not of the window |

- **Related, not changed:** [app/components/path/PathXpBar.vue](../../app/components/path/PathXpBar.vue) (reused for the bar, with its own label for screen readers), [app/components/hobby/HobbyReadyCard.vue:37-48](../../app/components/hobby/HobbyReadyCard.vue#L37-L48) (the finish line block of the ready card, same flag and colors).
- **Watch for:** on a desktop window narrower than about 1120 px the path column is under 512 px, so the card shows the mobile layout there. No new color token: the card uses `ink`, `surface`, `surface-2`, `muted`, `done`, `done-deep` and `done-ink`.

### G3. On the path page

| File | Why it changed |
|---|---|
| [app/components/path/PathView.vue](../../app/components/path/PathView.vue) | Two optional props, `finishLine` and `completedAt`; the card sits at the end of the path, under the last node, on mobile and desktop; it shows only once the path is drawn |
| [app/components/path/PathDesktopHeader.vue](../../app/components/path/PathDesktopHeader.vue) | Optional `goal` prop: one line "Goal: …" under the hobby title |
| [app/components/path/PathMobileHeader.vue](../../app/components/path/PathMobileHeader.vue) | Same line, under the Hobby_Switcher row (the title is not visible on mobile) |
| [app/pages/path.vue](../../app/pages/path.vue) | Passes the goal's finish line from the stored profile and the path's completion times |
| [CHANGELOG.md](../../CHANGELOG.md) | One line under Added |

- **Related, not changed:** [app/composables/useCloudStore.ts:371](../../app/composables/useCloudStore.ts#L371) (`save` stamps the completion time in state at once, so the date shows as soon as the last skill is completed).
- **Watch for:** no card on a path without a goal, on a path made before path-intake (Requirement 11.6) and on the demo path (`?demo=1`), which has no profile.

## Decisions

0. **Where the card sits.** Decided by the owner on 2026-11-23: at the end of the path, not at the start. It was first built above the path.
0b. **Goal line at the top.** Decided by the owner on 2026-11-23: one line under the title, "Goal: <finish line>", with no bar and no card. A long goal wraps to a second line and is not cut.

1. **What does "Set a new finish line" do?** Open. The reached state of the design has this button, and nothing in the app can change the goal of an existing path today. Options: (a) leave the button out until the flow is designed; (b) link it to `/new`, which starts a different path and not a new finish line; (c) a new flow that picks a new goal and extends this path, which needs a spec (intake, generation, what happens to XP and to the old milestone). Recommendation: (a) now, (c) as its own spec. The card ships without the button.
2. **Which skills are counted.** Decided by the agent on 2026-11-23, to confirm: Main_Nodes only, so the count reaches "12 of 12" exactly when the finish line is reached.
3. **Date format.** Decided by the agent on 2026-11-23, to confirm: day, short month and year in the reader's locale ("12 Nov 2026" or "Nov 12, 2026"), as the Subscription row does.

## Not changed on purpose

- No "Set a new finish line" button (decision 1).
- The demo path has no finish line. A sample one would need a sample profile next to the Sample_Tree.
- The ready card of `/new` keeps its label "Your finish line" and its own markup. It has no states.
- No spec folder: this is one card on data that path-intake already stores.

## Verification

- **Run:** `yarn test`: 147 files passed, 1 skipped; 1415 tests passed, 16 skipped (8 of them new). `yarn typecheck`: no errors.
- **Run:** the three states at 640 px and 360 px on a temporary dev page, in headless Chrome, boulder theme, compared with both design files. The page was deleted afterwards.
- **Not run:** the card inside a real signed-in path; the trail and halloween themes; a screen reader. No component tests exist in this project.

## Manual checks before release

- [ ] A new path with a goal and no known skills: the card says "The finish line", with "N skills to go" on a wide desktop window and "N skills between you and this." on a phone.
- [ ] Complete one skill: the bar appears with "1 of N skills" and the next milestone.
- [ ] Complete the last skill: the card turns green with "reached on" and today's date. Reset the path: it goes back to the first state.
- [ ] A path without a goal and `/path?demo=1`: no card.
- [ ] A 60 character finish line on a phone: the title wraps and nothing is cut.
- [ ] Trail and halloween themes: the card is readable in all three states.

## Follow-ups

- Spec for "Set a new finish line" (decision 1).
