# Known bugs

What is broken in Pursio right now, and the history of every bug fixed or accepted. Process: global steering `bug-fixes.md`.

IDs are `APP-<AREA>-NN` and are never reused. Severity: **Critical** can be exploited without an account; **High** hits users on the main path or exposes data; **Medium** is a wrong result or a dead end in a less common path; **Low** is minor or latent.

## Bugs with a test

Bug tests are named `BUG-<ID>: …` and marked `it.fails`; list them with `yarn test -t "BUG-"`.

None open.

## Bugs without a test yet

| ID | Severity | Where | What | Suggested fix |
|---|---|---|---|---|
| APP-FRESH-02 | Low | Fresh video cards ([app/components/fresh/FreshVideoCard.vue](app/components/fresh/FreshVideoCard.vue)) | Reported by the owner: card layout needs fixes. Details still to be written down. | Compare with `dev_docs/Mobile · Fresh@1x.png` and `dev_docs/Desktop · Fresh@1x.png`. |
| APP-FRESH-03 | Low | Fresh hero card ([app/components/fresh/FreshHeroCard.vue](app/components/fresh/FreshHeroCard.vue)) | Reported by the owner: hero card layout needs fixes. Details still to be written down. | Compare with the same Fresh mockups. |
| APP-FRESH-06 | Medium | Best_Section order in [shared/utils/fresh-view.ts](shared/utils/fresh-view.ts) (Req 9.11) | Under "All skills" the Selected_Path's window fills the first 8 Best cards; other hobbies get the last 3 or 4. | Mix hobbies; plan `.kiro/changes/2026-11-17-fresh-layout-and-variety.md`, G4. |
| APP-FRESH-07 | High | Fresh check job: cron `fresh-check` → [server/api/fresh/check.post.ts](server/api/fresh/check.post.ts) → [server/utils/fresh/check.ts](server/utils/fresh/check.ts) | Reported 2026-11-17: Fresh never shows "New for your path"; every day it says "No new videos today". Only pool videos from the skill pipeline appear. Cause (setup, 2026-11-17): every `fresh-check` cron run returns "0 rows", because Vault was never set up (owner, 2026-11-17): no `video_drain_app_url`, `video_drain_secret` or `fresh_check_secret`. No Fresh check has ever run, and the `video-drain` job has never sent a request either. | Create the Vault secret(s) and set the same value as `NUXT_FRESH_CHECK_SECRET` on Vercel (see `supabase/README.md`, "Fresh check job"). Follow-up: make a silent skip visible, e.g. a warning in the README or a health check. |
| APP-FRESH-08 | Medium | [server/utils/fresh/check.ts](server/utils/fresh/check.ts) (`sources.length === 0` → `storeAll([], [])`), [schedule.ts](server/utils/fresh/schedule.ts) `isDue` | A check with no Channel_Sources counts as a success, so the hobby is not checked again for 24 h even when sources appear minutes later. Seen 2026-11-17: coffee brewing checked at 20:30 with 0 sources, 2 sources added afterwards, never read. | Don't record a success (or use a short retry, e.g. 1 h) when the key had no sources. Needs a spec change (Req 4.13, 3.5). |
| APP-SEC-01 | Medium | [server/utils/rate-limiter.ts](server/utils/rate-limiter.ts), used by [server/utils/llm-runtime.ts](server/utils/llm-runtime.ts), video and fresh runtimes | Limits are kept in memory per serverless instance, and keyed by user id. Anonymous accounts are free to create, so a script can spread tree generations over new sessions and over Vercel instances and spend the default LLM key beyond 10 per user per hour. The only brake is Supabase's anonymous sign-in limit per IP (documented in `supabase/README.md`). | Move the limit to Postgres (a counter table or function shared by all instances), and add a global daily cap on default-key calls. |

## Accepted risks

None yet.

## Fixed

### APP-ANALYTICS-01 · Medium · Server analytics events did not join the visitor's funnel
- **Introduced:** 3b19d5c (2026-11-18), shipped in v0.6.0; copied to the intake route in 6338987 (2026-11-21)
- **Fixed in:** pending
- **Impact while it existed:** none for users. Reported as "`intake_shown`, `intake_answered` and `skill_path_generated` never arrive in production"; PostHog showed they did arrive (17, 16, 17 events since 2026-11-22), just not from ad traffic, which never reached `/new`. The real defects: server `$ai_generation` events used the Supabase user id while the browser used PostHog's own id, so for anonymous visitors no server event joined the funnel (0 of 24 server ids had a browser event); and `skill_path_generated` was sent only by the browser after a build of about 20 s, so a closed tab lost it.
- **Data / analytics impact:** server `$ai_generation` events from 2026-11-18 until the deploy sit on separate persons and cannot be joined to anonymous visitors. `skill_path_generated` undercounts builds whose tab closed before the answer. Not backfilled.
- **Fix:** the browser sends its PostHog ids with `/api/intake` and `/api/tree`; the server uses them for its events and sends `skill_path_generated` itself. Details: `.kiro/specs/sample-path/changes.md`, G1
- **Tests:** [tests/unit/analytics-identity.test.ts](tests/unit/analytics-identity.test.ts), [tests/unit/tree-route.test.ts](tests/unit/tree-route.test.ts), [tests/unit/path-intake-route.test.ts](tests/unit/path-intake-route.test.ts), [tests/property/sample-path-identity.property.test.ts](tests/property/sample-path-identity.property.test.ts)

### APP-FRESH-01 · Medium · One skill filled most of the Fresh page
- **Introduced:** 6b0f02f (2026-11-15), shipped in v0.4.0
- **Fixed in:** pending
- **Impact while it existed:** under "All skills" the Best_Section took every pool video of the first window skill before the next, so one skill could show the hero plus 4 or more cards.
- **Data / analytics impact:** none
- **Fix:** at most 3 cards per skill on the page, counted Hero, New, Best (decision D17); none under "For <current skill>". Details: `.kiro/changes/2026-11-17-fresh-layout-and-variety.md`, G2
- **Tests:** [tests/unit/fresh-view-examples.test.ts](tests/unit/fresh-view-examples.test.ts), [tests/property/fresh-sections.property.test.ts](tests/property/fresh-sections.property.test.ts)

### APP-FRESH-04 · Low · "All skills" was not the first Fresh chip
- **Introduced:** 6b0f02f (2026-11-15), shipped in v0.4.0
- **Fixed in:** pending
- **Impact while it existed:** "For <current skill>" sat left of the default chip "All skills".
- **Data / analytics impact:** none
- **Fix:** "All skills" comes first (Req 14.1). Details: `.kiro/changes/2026-11-17-fresh-layout-and-variety.md`, G1
- **Tests:** [tests/unit/fresh-page.test.ts](tests/unit/fresh-page.test.ts), [tests/unit/fresh-view-examples.test.ts](tests/unit/fresh-view-examples.test.ts)

### APP-FRESH-05 · Low · Fresh page was not centered on wide screens
- **Introduced:** 6b0f02f (2026-11-15), shipped in v0.4.0
- **Fixed in:** pending
- **Impact while it existed:** content hugged the left edge with the Sources panel far right, unlike Quests and Profile.
- **Data / analytics impact:** none
- **Fix:** same `mx-auto max-w-360` container as Quests and Profile. Details: `.kiro/changes/2026-11-17-fresh-layout-and-variety.md`, G3
- **Tests:** none (layout); manual check

### APP-PATH-02 · Medium · Side quests and labels overlapped on the path
- **Introduced:** 5e87939 (2026-11-08), shipped in v0.2.0
- **Fixed in:** e2b28c2, v0.6.1
- **Impact while it existed:** next to a side quest, the side quest's title covered the next skill's title, a second side quest sat on the first one's "Side quest" line, and trail dots sat on a skill's status line. Reported by the owner 2026-11-20 (desktop, 454 px column).
- **Data / analytics impact:** none
- **Fix:** a skill with side quests gets a taller gap below it, sized for the side quests and their labels; titles are clamped. Details: `.kiro/changes/2026-11-20-path-label-overlap.md`, G1
- **Tests:** [tests/unit/path-layout.test.ts](tests/unit/path-layout.test.ts), [tests/property/path-layout.property.test.ts](tests/property/path-layout.property.test.ts) (Properties 16, 17, 19, 21)

### APP-PATH-03 · High · A generated path could not be drawn
- **Introduced:** 5e87939 (2026-11-08), shipped in v0.2.0 (the layout rule); reachable since generated trees exist
- **Fixed in:** 3fb52f4, v0.6.2
- **Impact while it existed:** a generated path where a main skill needs a side quest, or where a side quest was listed before the skill it needs, showed only "This path could not be drawn." and could not be used. Seen by the owner 2026-11-20 on "Walking" (`route-planning` requires `first-30-minute-walk`).
- **Data / analytics impact:** none; the saved tree and progress were never changed
- **Fix:** the layout accepts a side quest that needs a later skill and a main skill that needs a side quest drawn above it; generation rejects trees with a bad main-skill order. Details: `.kiro/changes/2026-11-20-path-could-not-be-drawn.md`, G1
- **Tests:** [tests/unit/path-layout.test.ts](tests/unit/path-layout.test.ts), [tests/unit/skill-tree-load.test.ts](tests/unit/skill-tree-load.test.ts)

### APP-PATH-01 · High · Ticking a quest reloaded the skill's videos
- **Introduced:** 9731aae (2026-11-14), shipped in v0.3.0
- **Fixed in:** pending
- **Impact while it existed:** each quest tick or untick in the skill sheet or side panel hid the Watch section and the "Watch how" links, stopped a playing video, restarted the "Finding videos" polling, then showed the videos again.
- **Data / analytics impact:** one extra `/api/videos` request per quest tick; no stored data affected.
- **Fix:** `useSkillVideos` reloads only when the request values change. Details: `.kiro/changes/2026-11-17-videos-reload-on-quest-tick.md`, G1
- **Tests:** [tests/unit/use-skill-videos.test.ts](tests/unit/use-skill-videos.test.ts)
