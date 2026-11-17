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
| APP-SEC-01 | Medium | [server/utils/rate-limiter.ts](server/utils/rate-limiter.ts), used by [server/utils/llm-runtime.ts](server/utils/llm-runtime.ts), video and fresh runtimes | Limits are kept in memory per serverless instance, and keyed by user id. Anonymous accounts are free to create, so a script can spread tree generations over new sessions and over Vercel instances and spend the default LLM key beyond 10 per user per hour. The only brake is Supabase's anonymous sign-in limit per IP (documented in `supabase/README.md`). | Move the limit to Postgres (a counter table or function shared by all instances), and add a global daily cap on default-key calls. |

## Accepted risks

None yet.

## Fixed

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

### APP-PATH-01 · High · Ticking a quest reloaded the skill's videos
- **Introduced:** 9731aae (2026-11-14), shipped in v0.3.0
- **Fixed in:** pending
- **Impact while it existed:** each quest tick or untick in the skill sheet or side panel hid the Watch section and the "Watch how" links, stopped a playing video, restarted the "Finding videos" polling, then showed the videos again.
- **Data / analytics impact:** one extra `/api/videos` request per quest tick; no stored data affected.
- **Fix:** `useSkillVideos` reloads only when the request values change. Details: `.kiro/changes/2026-11-17-videos-reload-on-quest-tick.md`, G1
- **Tests:** [tests/unit/use-skill-videos.test.ts](tests/unit/use-skill-videos.test.ts)
