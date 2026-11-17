# Changes: videos reload on every quest tick

Reported by the owner on 2026-11-17: every quest change removes the videos and re-renders them. Ledger: APP-PATH-01.

- **Repos and branches:** `pursio` (current branch)
- **State:** uncommitted
- **Status:** 1 of 1 done
- **Size:** 3 files changed (code, ledger, changelog), 1 test file added, in 1 group

## Scenarios

| ID | Starting state | Action | Expected result | Bug | Status |
|---|---|---|---|---|---|
| S1 | Skill sheet open, videos shown | Tick or untick a quest | Videos stay; no new request | APP-PATH-01 | Done |
| S2 | Skill sheet open, a video playing | Tick a quest | The video keeps playing | APP-PATH-01 | Done |
| S3 | Signed in, "Finding videos" shown while a fill runs | Tick a quest | Polling continues where it was, no restart | APP-PATH-01 | Done |
| S4 | Skill sheet open | Tick the last quest and complete the skill | Videos for that skill stay | APP-PATH-01 | Done |
| S5 | Skill sheet open | Open another skill | Videos for the new skill load (must stay) | | Done |
| S6 | Mobile, sheet open | Close the sheet, reopen the same skill | Videos load again (must stay) | | Done |
| S7 | Skill sheet open | Language changes in the account | Videos load again in the new language (must stay) | | Done |

## Groups

### G1. Reload videos only when the request changes (APP-PATH-01, S1 to S7)

**Cause:** [PathView.vue:277-293](../../app/components/path/PathView.vue#L277-L293) builds `videoParams` from `detail`, and `detail` ([PathView.vue:108](../../app/components/path/PathView.vue#L108)) includes the quest checks. A tick creates a new, equal params object. The watcher in [useSkillVideos.ts:76-88](../../app/composables/useSkillVideos.ts#L76-L88) runs on every new object and `load()` sets the state to hidden before fetching. The bug came with the video pipeline in `9731aae` (2026-11-14), first shipped in v0.3.0.

**Change:** in `useSkillVideos`, watch a key made of the six request values (hobby, skill title, level, language, path id, skill id) instead of the object. `null` stays its own case, so closing the sheet still stops and reopening still loads. Fixing it in the composable covers any future caller too.

| File | Why it changed |
|---|---|
| [app/composables/useSkillVideos.ts](../../app/composables/useSkillVideos.ts) | Watches a key of the six request values instead of the params object, so an equal request keeps the videos |
| [tests/unit/use-skill-videos.test.ts](../../tests/unit/use-skill-videos.test.ts) | New. Regression test for S1 (one load for equal params, state stays ready), plus S5, S6 and S7 |

- **Must not change:** S5, S6, S7. A failed request still hides only the Watch section.
- **Related, not changed:** [PathNodeDetail.vue](../../app/components/path/PathNodeDetail.vue) (renders `WatchSection` and "Watch how" from the state), the fill request in PathView, which watches `currentId` and is a separate call.
- **Watch for:** S6 depends on the key being cleared when params go to `null`.

## Decisions

None open.

## Verification

- **Run:** before the fix, the bug test failed with "expected 1 call, got 2". After: `yarn test` 1058 passed, 11 skipped, 0 failed; `yarn typecheck` clean.
- **Not run:** no component test of PathView; S2 (playback continues) and S3 (polling continues) follow from no reload but are only checked by hand.

## Manual checks before release

- [ ] S1, S2: open a skill with videos, play one, tick a quest. Nothing flickers and playback continues.
- [ ] S6: on mobile, close and reopen the sheet; videos load.
