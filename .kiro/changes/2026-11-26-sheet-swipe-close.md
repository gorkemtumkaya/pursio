# Changes: swipe down to close bottom sheets

The owner asked on 2026-11-26 that bottom drawers close with a swipe down. Every mobile bottom drawer in the app is one component, `PathBottomSheet`, so the change is made once there. It covers the Skill_Sheet and the hobby sheet on `/path`, the Sources sheet on `/fresh`, and the skill and "Make it yours" sheets on the sample paths.

- **Repos and branches:** `pursio` `main`
- **State:** committed on `main`, in the commit that adds this file
- **Size:** 2 files changed, 3 added, in 2 groups

## Review order

1. G1: when a drag closes the sheet. G2 only measures the finger and calls it.
2. G2: the touch handling and the sheet.

## Groups

### G1. Close decision

Pure functions, so the thresholds are tested without a DOM. A drag closes the sheet at 120 px (or a third of a short sheet), or at 24 px when it is a flick of at least 0.5 px/ms. A shorter drag springs back.

| File | Why it changed |
|---|---|
| [app/utils/sheet-swipe.ts](../../app/utils/sheet-swipe.ts) | New. `swipeAxis` (drag down or not, after an 8 px slop), `closeDistance`, `shouldCloseSheet` and the thresholds |
| [tests/unit/sheet-swipe.test.ts](../../tests/unit/sheet-swipe.test.ts) | New. Slop, direction, long slow drag, flick, short twitch, back at the top |

### G2. Touch handling on the sheet

The sheet follows the finger with an inline `transform` while its content is scrolled to the top. On release it calls `close` (the same event as the close button) or springs back. The Transition's `@leave` hook clears the drag's `transition: none`, so a dragged sheet slides out from where the finger left it. This works because the Tailwind v4 `translate-y-full` class moves `translate`, not `transform`, so the two add up.

| File | Why it changed |
|---|---|
| [app/composables/useSheetSwipe.ts](../../app/composables/useSheetSwipe.ts) | New. Touch handlers and the leave hook |
| [app/components/path/PathBottomSheet.vue](../../app/components/path/PathBottomSheet.vue) | Binds the four touch events and `@leave`; doc comment names the swipe |
| [CHANGELOG.md](../../CHANGELOG.md) | One line under Added |

- **Related, not changed:** [app/components/path/PathView.vue](../../app/components/path/PathView.vue), [app/components/fresh/FreshSourcesSheet.vue](../../app/components/fresh/FreshSourcesSheet.vue), [app/components/sample/SampleView.vue](../../app/components/sample/SampleView.vue): the callers. Their `@close` handlers already return focus and record analytics. A swipe goes through the same handlers, so nothing changes there.
- **Watch for:**
  - A gesture becomes a drag only when it starts with the content at the top, moves mainly down, and does not start inside a box that is scrolled down (a long note field). Sideways swipes on the Fresh row and the video list, and normal scrolling, stay with the content.
  - The handlers call `preventDefault` on a touchmove that looks like a drag down, even before the 8 px slop, because iOS ignores a cancel once it has started its own pull. A sideways swipe whose very first move points more down than sideways could lose its scroll for that one gesture.
  - Touches on the embedded YouTube player do not reach the sheet (iframe), so the player area cannot start a drag.
  - With reduced motion, the drag still follows the finger (direct manipulation); the spring-back and the slide-out do not animate.

## Not changed on purpose

- No drag from the backdrop, and no drag up to expand: the sheets have one height.
- When the content is scrolled down, pulling to the top and on in one gesture scrolls but does not drag. A new touch at the top drags. Handing one gesture over from scrolling to dragging needs more code than this change is worth.
- No new dependency (such as a drawer library).

## Verification

- **Run:** `yarn vitest run`: 1571 passed, 16 skipped, 0 failed. `yarn typecheck`: clean.
- **Not run:** no component or browser test. The test suite runs in Node without a DOM, so the touch handling is checked by hand only.

## Manual checks before release

- [ ] On an iPhone (Safari) and an Android phone (Chrome), on `/path`: open a skill, drag down from the handle, release halfway: the sheet springs back. Drag further or flick: it slides down and focus returns to the node.
- [ ] Same on the hobby sheet, the `/fresh` Sources sheet and both sheets of `/try/guitar`.
- [ ] In a long Skill_Sheet, scroll down, then swipe down: the content scrolls up, the sheet stays. At the top, a new swipe closes it.
- [ ] Swipe sideways on the Fresh row inside the Skill_Sheet: the row scrolls, the sheet does not move.
- [ ] Tap the close button and the backdrop: both still close.
- [ ] Type a long note in the sample "Make it yours" sheet, scroll inside the field: the field scrolls, the sheet stays.

## Follow-ups

- None.
