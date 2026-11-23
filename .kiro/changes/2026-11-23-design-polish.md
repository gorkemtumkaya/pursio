# Changes: design polish from reviewer feedback

On 2026-11-23 a design reviewer sent feedback on the landing page, the path and the Quests page. The owner chose which items to apply. The full list with the decision per item is in `dev_docs/design-feedback.md` (that folder is not in git); the IDs below (L2, P1, Q1...) come from it.

- **Repos and branches:** `pursio` `design-polish`
- **State:** uncommitted
- **Size:** 20 files changed, 3 added, in 9 groups

## Review order

1. G1: the new color token, because G2 and G5 use it.
2. G2 and G3: the path changes. G3 is the only one that touches logic.
3. G5: the Quests card, the largest markup change.
4. G4: the landing page, markup and copy only.
5. G6: documents.

## Groups

### G1. A text color for finished items (P1)

Completed quest text needed a green that is readable and not bright. `done` is too light for text and `done-deep` is too dark on the dark halloween theme, so there is a new token, `done-text`.

| File | Why it changed |
|---|---|
| [app/assets/css/themes.css](../../app/assets/css/themes.css) | `--pursio-done-text` in all three themes: same value as `done-deep` in boulder and trail, a light purple in halloween |
| [app/assets/css/main.css](../../app/assets/css/main.css) | Maps the token, so `text-done-text` exists |
| [app/pages/dev/theme.vue](../../app/pages/dev/theme.vue) | Swatch for the new token, as the structure rule asks |
| [tests/unit/contrast.test.ts](../../tests/unit/contrast.test.ts) | `done-text` must reach 4.5:1 on `bg`, `surface` and `surface-2` in every theme |

- **Watch for:** in halloween "done" is purple, so the finished text is light purple there, not green.

### G2. Finished quests stay readable (P1)

| File | Why it changed |
|---|---|
| [app/components/path/PathQuestItem.vue](../../app/components/path/PathQuestItem.vue#L40-L43) | A ticked quest is `text-done-text` with no strike-through, was `text-muted line-through` |

- **Related, not changed:** [QuestsTodayCard.vue](../../app/components/quests/QuestsTodayCard.vue) uses the same component, so the Quests page gets this too.

### G3. "Skip this skill" while quests are open (P2)

The reviewer asked to disable the button until 3 of 3. The owner decided to keep it active and change the label instead.

| File | Why it changed |
|---|---|
| [app/utils/node-visual.ts](../../app/utils/node-visual.ts#L167-L185) | `buttonFor` takes `allQuestsTicked`; with quests open it returns "Skip this skill" in a quieter surface style |
| [app/components/path/PathNodeDetail.vue](../../app/components/path/PathNodeDetail.vue#L54-L56) | Passes whether all quests of the node are ticked |
| [tests/unit/node-visual.test.ts](../../tests/unit/node-visual.test.ts) | Both labels, both enabled, different classes |

- **Related, not changed:** [useSkillPath.ts](../../app/composables/useSkillPath.ts) and the Progress_Engine. Completing works exactly as before: the node is completed, 50 XP is added and ticked quests stay as they are.
- **Watch for:** the skip button is not the red primary button. That was my choice, so that 3 of 3 visibly changes the button; it is one class constant (`BUTTON_SKIP`) to undo.

### G4. Landing page (L2 to L8)

| File | Why it changed |
|---|---|
| [app/components/landing/LandingHero.vue](../../app/components/landing/LandingHero.vue) | L3: the badge is `surface-2` with `ink` text, so it no longer shares a color with the form error. L2: the input has a thicker `ink` border and its label is larger and in `ink`. On focus the border turns `primary` and there is no outline (owner, 2026-11-23). The path preview is right-aligned when it sits beside the text, so the hero ends on the same right edge as the cards below (owner, 2026-11-23) |
| [app/components/landing/LandingPathPreview.vue](../../app/components/landing/LandingPathPreview.vue) | L4: an "EXAMPLE PATH" label above the card. L5: the card is flat with a dashed border, with no raised shadow and no pointer events |
| [app/components/landing/LandingHowItWorks.vue](../../app/components/landing/LandingHowItWorks.vue) | L6: heading and the three steps sit in one card; the steps lost their own borders |
| [app/components/landing/LandingFaq.vue](../../app/components/landing/LandingFaq.vue) | L7: heading and questions sit in one card, with a line between questions. The card is as wide as the other sections (1160 px, was 820), and answers stay at most 720 px wide so lines do not get long (owner, 2026-11-23). Opening and closing a question animates the height in CSS, with no script; browsers without `interpolate-size` and `::details-content` switch at once, and reduced motion turns it off |
| [app/components/landing/LandingClosing.vue](../../app/components/landing/LandingClosing.vue) | L8, new: a closing card with a "Choose a hobby" link that scrolls to the hobby input and focuses it |
| [app/components/landing/LandingView.vue](../../app/components/landing/LandingView.vue) | Places the closing card after the FAQ |
| [app/utils/landing-copy.ts](../../app/utils/landing-copy.ts) | Copy for the preview label and the closing card |

- **Watch for:** the closing link is `href="#top"`, so it still works without script. With script it focuses the input, which opens the keyboard on a phone.
- **Watch for:** the closing copy ("Ready to start? Pick a hobby.", "Type it in and see your path. No signup needed.") is mine; only the button text "Choose a hobby" came from the feedback.

### G5. Quests: one card for today's quests (Q1 to Q3)

| File | Why it changed |
|---|---|
| [app/components/quests/QuestsTodayCard.vue](../../app/components/quests/QuestsTodayCard.vue) | The dark banner and the separate rows became one light card: header, a line, then the rows. The skill name shows once above the rows when all share it |
| [app/utils/quests-view.ts](../../app/utils/quests-view.ts) | `TodayView.sharedNodeTitle`: the skill title when 2 or more rows all come from one skill, else null |
| [app/components/quests/QuestsRing.vue](../../app/components/quests/QuestsRing.vue) | The open part of the ring uses `line`, not `muted`, because it now sits on a light surface |
| [tests/unit/quests-today-view.test.ts](../../tests/unit/quests-today-view.test.ts) | New: one skill, mixed skills, one quest, no pick |

- **Related, not changed:** [QuestsWeeklyCard.vue](../../app/components/quests/QuestsWeeklyCard.vue) and [QuestsLogCard.vue](../../app/components/quests/QuestsLogCard.vue) stay as their own sections (Q4). The Today card has a raised bottom shadow so it still leads the page.
- **Watch for:** when today's quests come from different skills, each row keeps its own skill name, as before. The accessible name of each checkbox still includes the skill name in both cases.

### G7. Pointer cursor on every button

Asked by the owner on 2026-11-23: some buttons did not change the cursor on hover. Tailwind v4 gives buttons the default arrow, and only some components added `cursor-pointer` by hand.

| File | Why it changed |
|---|---|
| [app/assets/css/main.css](../../app/assets/css/main.css) | A base rule gives every enabled `button`, `[role="button"]` and `summary` the pointer |

- **Related, not changed:** the components that already set `cursor-pointer` or `cursor-not-allowed`. Utilities still win over the base rule, and disabled buttons keep the arrow.

### G8. A reusable primary button, with a bouncy option

Asked by the owner on 2026-11-23: a bouncy, uplifting animation on the closing "Choose a hobby" button, as a reusable button because the same style is repeated in many places.

| File | Why it changed |
|---|---|
| [app/components/AppButton.vue](../../app/components/AppButton.vue) | New: the primary raised button as a `<button>`, a NuxtLink (`to`) or an `<a>` (`href`), in two sizes. `bouncy` adds a springy lift on hover and a press on click |
| [app/components/landing/LandingClosing.vue](../../app/components/landing/LandingClosing.vue) | Uses `AppButton` with `bouncy` |

The owner then asked (2026-11-23) to put the animation on the main action of a screen and on reward moments. So the animation is a `bouncy` utility in CSS, which `AppButton` uses too, and these buttons got the class with no other change to their look:

| File | Button |
|---|---|
| [app/assets/css/main.css](../../app/assets/css/main.css) | The `bouncy` utility: hover lift, press, `--bouncy-depth` for the shadow depth |
| [app/components/landing/LandingHero.vue](../../app/components/landing/LandingHero.vue) | "Build my path" |
| [app/utils/node-visual.ts](../../app/utils/node-visual.ts) | "Mark complete" at 3 of 3; "Skip this skill" stays still |
| [app/components/path/PathUnlockCard.vue](../../app/components/path/PathUnlockCard.vue) | "Continue" after a skill is completed |
| [app/pages/new.vue](../../app/pages/new.vue) | The build button; its own short press transition is replaced by `bouncy` |
| [app/components/hobby/HobbyReadyCard.vue](../../app/components/hobby/HobbyReadyCard.vue) | "Open my path" |
| [app/components/quests/QuestsEmpty.vue](../../app/components/quests/QuestsEmpty.vue) | "Build a path" |
| [app/pages/welcome.vue](../../app/pages/welcome.vue) | The welcome button |

- **Not given the animation on purpose:** founding and pricing checkout buttons (owner's call, still open), settings, sign-in, retry, confirm dialogs and Fresh cards.
- **Related, not changed:** about 15 other primary buttons still carry their own classes (hero, founding, waitlist, pricing, auth, settings, hobby pages, Fresh, path). They differ in height, radius, shadow depth and focus ring, so moving them changes their look slightly and is a batch of its own.
- **Watch for:** the bounce is off under reduced motion and on a disabled button. On touch screens there is no hover, so only the press shows.

### G9. A more compact intake panel

Asked by the owner on 2026-11-23: the panel with the tap questions on `/new` is too tall.

| File | Why it changed |
|---|---|
| [app/components/hobby/HobbyIntakeQuestion.vue](../../app/components/hobby/HobbyIntakeQuestion.vue) | Question title 18 px (was 21) and options in 14 px text, so more fit on a row. Options are 36 px high with a mouse and stay 44 px on touch |
| [app/components/hobby/HobbyIntakePanel.vue](../../app/components/hobby/HobbyIntakePanel.vue) | "Build my path" is 52 px high (was 58). After the form column was widened, the owner asked for more room in the panel again: padding is 24 px and the gap between questions 24 px on desktop |
| [app/pages/new.vue](../../app/pages/new.vue) | The form column is wider on desktop (about 640 px, was about 520) and Wick's column narrower (about 330 px), so more options fit on a row. The gap between the two columns is 48 px (was 24) |

- **Watch for:** the 44 px touch target rule still holds on touch screens; only mouse users get the 36 px options.
- The header of `/new` now has the same width and side padding as the content (1048 px), so the logo and the actions line up with it (owner, 2026-11-23). The landing header already matched its sections (1160 px) and did not change.
- **Watch for:** the column widths apply to every state of `/new` (form, building, ready, limit card), not only to the panel.
- **Related, not changed:** the options, their wording and how many there are come from intake.

### G6. Documents

| File | Why it changed |
|---|---|
| [.kiro/specs/skill-path-ui/requirements.md](../specs/skill-path-ui/requirements.md) | Req 8.8 (no strike-through) and 8.10 (two labels) |
| [.kiro/specs/quests-page/requirements.md](../specs/quests-page/requirements.md) | Req 5.2 (skill name once) and 5.3 (no strike-through) |
| [CHANGELOG.md](../../CHANGELOG.md) | Entries under Unreleased |

## Decisions

1. **Completed quest text (P1).** Decided 2026-11-23: remove the strike-through and make the text green, but not a bright green.
2. **"Mark complete" with quests open (P2).** Decided 2026-11-23: the button stays active at all times. While not all quests are done it says something like "Skip the Skill". The wording used is "Skip this skill".
3. **Mascot per hobby (M1).** Decided 2026-11-23: skipped, it needs further consideration.

## Not changed on purpose

- The `landing-page` spec. Its section list and FAQ wording were already behind the code before this batch, so adding the closing card there alone would not make it correct.
- The design mockups in `dev_docs/` and `docs/design/`. They still show the old look.
- No analytics event for the closing link. Adding one means a new event name; say if you want it.

## Verification

- **Run:** `yarn test`: 146 files and 1407 tests pass (1394 before; the 13 new ones are the contrast pairs, the button labels and the today view). `yarn typecheck`: no errors.
- **Seen in a headless Chrome screenshot of the dev server:** the landing page at 1280 px, and `/path?demo=1` at 1440 px with the "Skip this skill" button.
- **Not run:** no component tests exist for these components. The Quests page was not opened, because it needs a signed-in path. Nothing was checked at phone width, in the trail and halloween themes, or with a ticked quest on screen.

## Manual checks before release

- [ ] Quests page with three quests from one skill: one card, skill name once, ring readable.
- [ ] Quests page with quests from two skills: each row shows its skill.
- [ ] Path: tick all three quests and see the button turn into the red "Mark complete"; untick one and see "Skip this skill".
- [ ] Ticked quest text in all three themes.
- [ ] Landing page at 390 px: the How it works card, the FAQ card and the closing card.
- [ ] Closing "Choose a hobby": scrolls to the input and focuses it.

## Follow-ups

- M1: decide how Wick should dress for hobbies without a fitting outfit.
