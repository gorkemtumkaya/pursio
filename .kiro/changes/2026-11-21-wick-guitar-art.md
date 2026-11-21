# Changes: Wick guitar outfit rebuilt from the source drawing

On 2026-11-21 the owner changed `dev_docs/wick-v2/Wick/hobby-guitar.svg` and asked for the guitar outfit in the app to be updated from it.

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Size:** 2 files changed, 1 added, in 1 group

## Review order

1. G1: the only group.

## Groups

### G1. Guitar accessory follows the new drawing

The generated art file was rebuilt with `node scripts/build-wick-art.mjs`. Nothing was edited by hand.

| File | Why it changed |
|---|---|
| [app/utils/wick-art.ts:68](../../app/utils/wick-art.ts#L68) | `WICK_ACCESSORY_ART.guitar`: the last of its 9 paths, the lower part of the guitar body, is now a rounded shape (`M248.414 279.647...`) where it was a rectangle (`M267 280.5H228V310.5H267V280.5Z`) |
| [CHANGELOG.md](../../CHANGELOG.md) | One line under Unreleased |

- **Related, not changed:**
  - [scripts/build-wick-art.mjs](../../scripts/build-wick-art.mjs) builds the file from the drawings.
  - [app/components/mascot/wick.vue:145](../../app/components/mascot/wick.vue#L145) draws the accessory.
- **Watch for:** `dev_docs` is in `.gitignore`, so the source drawing is not in the commit. Only the generated file shows the change.

## Not changed on purpose

- **The other outfits and the faces:** the script rebuilt all of them, and their output is the same as before. The diff is one line.

## Verification

- **Run:** `node scripts/build-wick-art.mjs`: 8 faces and 8 accessories, guitar with 9 paths as before. `git diff --stat`: 1 line changed in `wick-art.ts`. `yarn typecheck`: no errors. The source drawing was rendered to an image and looked at.
- **Not run:** the unit tests, because none of them read the art file. The outfit was not looked at in the running app.

## Manual checks before release

- [ ] Open `/dev/wick` and look at the guitar outfit: the guitar body is drawn in full and sits at Wick's lower right.
