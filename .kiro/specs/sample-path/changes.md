# Changes: Sample path page

Implementation of the `sample-path` spec ([scenarios](scenarios.md), [requirements](requirements.md), [design](design.md), [tasks](tasks.md)). It covers every task of the spec: task 1, the analytics bug APP-ANALYTICS-01, fixed first and on its own as the owner asked (plan reviewed on 2026-11-23 before the code changed), and tasks 2 to 13, the sample path page. What is left is the owner's: the rows E1 and F1 of the launch gate, the production check of the bug fix, and the manual rows after launch.

- **Repos and branches:** `pursio`. G1 was made on `fix/analytics-funnel-chain` and merged into `main`; everything after it is on `main`
- **State:** G1 committed in `f5101ed` and merged into `main` (fast forward) on 2026-11-23; checked alone in a clean worktree: 1434 passed, 16 skipped. Spec documents in `9fccee2`. G2 in `6afec4a`. G3 in `43dac82`. G4 in `42c4730`. G5 in `0abcd39`. G6 in `9a355d8`. G7 in `2f7206d`. G8 in `0676bcd`. G9 committed with this update. From G2 on, work is on `main` and each separate task is committed when done (owner, 2026-11-23)
- **Status:** 1 of 1 done *(bug fixes)*; the production check F4 waits for the deploy
- **Size:** G1: 9 files changed, 4 added. G2: 2 files changed, 13 added (incl. 3 generated data files). G3: 4 files changed, 7 added. G4: 7 files changed, 5 added. G5: 7 files changed, 3 added. G6: 2 files changed, 2 added. G7: 2 files changed, 3 added. G8: 3 files changed, 7 added. G9: 4 files changed. 9 groups

## Scenarios *(bug fixes)*

F4 to F6 are the rows of [scenarios.md](scenarios.md). S1 to S4 are behaviour next to the fix that must stay the same.

| ID | Starting state | Action | Expected result | Bug | Status |
|---|---|---|---|---|---|
| F4 | Anonymous visitor, came through the landing page or a sample page | Builds a path | In PostHog, one person holds `landing_viewed` (or `sample_viewed`), `intake_shown`, `intake_answered`, `skill_path_generated` and the `$ai_generation` events of the build | APP-ANALYTICS-01 | Done in code; production check after the deploy |
| F4b | Same visitor | Closes the tab while the path is generating, after the server finished | `skill_path_generated` is still recorded, because the server sends it | APP-ANALYTICS-01 | Done |
| F4c | Build is served from the tree cache | Builds a plain path for a hobby built before | `skill_path_generated` is sent with `cached: true`, as the browser event was sent for cache hits before | APP-ANALYTICS-01 | Done |
| F5 | PostHog blocked in the browser, or the headers missing or not usable | Builds a path | Server events fall back to the Supabase user id, as today. The build is not affected | APP-ANALYTICS-01 | Done |
| F6 | Video fill and Fresh check jobs | Run | Their `$ai_generation` events keep the server process id | APP-ANALYTICS-01 | Done |
| S1 | Signed in visitor | Builds a path | Same person as before: after `identify`, the browser's distinct id is the user id, so nothing moves | | Must not change |
| S2 | Any | Builds a path | Response body, status, rate limit, cache and save are unchanged | | Must not change |
| S3 | PostHog not configured on the server | Builds a path | No event, no error, same response | | Must not change |
| S4 | Any | Sends a forged `X-POSTHOG-DISTINCT-ID` | The header changes only which analytics person the sender's own events join. No access, limit or stored data depends on it | | Must not change |

## Findings

What the owner reported: in production, `intake_shown`, `intake_answered` and `skill_path_generated` never arrive, while `landing_viewed` does.

What PostHog showed on 2026-11-23, on the production host, from the first production event (2026-11-22) on:

| Check | Result |
|---|---|
| `landing_viewed` | 229 events, 214 ids |
| `intake_shown`, `intake_answered`, `skill_path_generated` | 17, 16 and 17 events from 8, 7 and 8 ids. **They arrive** |
| Ids whose `landing_viewed` carries a utm parameter (all Reddit) | 70. Of these: 1 opened `/new`, 0 submitted the hero form, 0 reached `intake_shown` |
| Ids with a `/new` page view | 14, of which 8 sent `intake_shown` |
| Server `$ai_generation` events | 145: 48 under 11 Supabase user ids, 97 under 13 server process ids (background jobs) |
| Server ids that also have a browser event | 0 of 24 |

So the report has two parts:

1. **Not a code defect:** in a view filtered to ad traffic the three events are absent because no ad visitor reached them. The sample page is the answer to that, not this fix.
2. **Real defects**, below as one group, since they share a cause and a fix.

## Review order

1. G1. One identity for browser and server events: the bug fix, independent of the rest.
2. G2. Sample data and the converter script: the base every later sample page task reads.
3. G3. The route without a session: the first code that runs for an ad visitor.
4. G4. Preview_Mode of the shared components: the only changes to files the real path screen uses; check that every default keeps today's output.
5. G5. The page: top bar, intro card, path and finish card, built from the components of G4.
6. G6. Skill preview and selection: the read only skill detail, its videos with no recording, and the mobile sheet.
7. G7. Make it yours: the box, the mobile bar and sheet, the founding line. The build buttons do nothing until G8.
8. G8. Handoff and events: the only code that leaves the sample page, and the funnel events.
9. G9. Guards: static tests that keep the page free of costly code and consistent with the design rules.

## Groups

### G1. One identity for browser and server events (APP-ANALYTICS-01, Req 12; F4 to F6)

**Cause:**

- The browser identifies events with PostHog's own distinct id, set by [app/plugins/posthog.client.ts:18](../../../app/plugins/posthog.client.ts#L18). Only a signed in account is linked to the user id, by `identify` in [app/composables/useAuth.ts:65-73](../../../app/composables/useAuth.ts#L65-L73). An anonymous visitor, which is every ad visitor, is never identified.
- The server sends `$ai_generation` under the Supabase user id: [server/utils/llm-handlers.ts:186](../../../server/utils/llm-handlers.ts#L186) and [server/utils/intake-handlers.ts:179](../../../server/utils/intake-handlers.ts#L179) pass `userId` to `createAiObservabilityContext`, which [server/utils/ai-observability.ts:116](../../../server/utils/ai-observability.ts#L116) uses as the distinct id. For an anonymous visitor that id is a second, separate person.
- `skill_path_generated` is sent only by the browser, after the response: [app/composables/useHobbyBuilder.ts:323](../../../app/composables/useHobbyBuilder.ts#L323). A build takes about 20 s, and a tab closed before the answer loses the event.
- The plugin's `tracing_headers` option adds PostHog headers to same-origin requests ([posthog.client.ts:20-21](../../../app/plugins/posthog.client.ts#L20-L21)), but no server code reads them.

Introduced in `3b19d5c` (2026-11-18), first released in v0.6.0. The intake route copied the pattern in `6338987` (2026-11-21).

**Change:** the browser sends its PostHog distinct id and session id with the two build requests; the server uses them for its events and sends `skill_path_generated` itself; the browser no longer sends it (decision 13, OD1: server only).

| File | Why it changed |
|---|---|
| [shared/utils/analytics-identity.ts](../../../shared/utils/analytics-identity.ts) | New. The two header names, shared by browser and server, and `usableAnalyticsId`: null for a missing, empty, over 200 character, control character or `$posthog_cookieless` value. Shared so the browser never sends what the server would reject |
| [app/utils/analytics.ts:39-57](../../../app/utils/analytics.ts#L39-L57) | New `analyticsHeaders(client)`: the two headers from `get_distinct_id()` and `get_session_id()`, or `{}` without a client, without a usable id, or when the client throws |
| [app/composables/useHobbyBuilder.ts:197](../../../app/composables/useHobbyBuilder.ts#L197), [:308](../../../app/composables/useHobbyBuilder.ts#L308) | The headers go with `/api/intake` and `/api/tree`, spread before the bearer header so they can never replace it |
| [app/composables/useHobbyBuilder.ts:323](../../../app/composables/useHobbyBuilder.ts#L323) | The browser capture of `skill_path_generated` is gone; a comment says where it is sent now |
| [server/utils/analytics-events.ts](../../../server/utils/analytics-events.ts) | New. `readAnalyticsIdentity` (the session id is dropped when unusable, the distinct id decides null) and `captureServerEvent`, which awaits the flush and never throws |
| [server/utils/ai-observability.ts:5-12](../../../server/utils/ai-observability.ts#L5-L12), [:78](../../../server/utils/ai-observability.ts#L78), [:105-112](../../../server/utils/ai-observability.ts#L105-L112), [:134](../../../server/utils/ai-observability.ts#L134) | Context gains `browserSessionId`, sent as `$session_id`; `$ai_session_id` stays the process id. The client getter is exported as `serverPosthogClient` so both senders share one client. `currentAiObservabilityContext` lets tests see which id a call ran under |
| [server/api/tree.post.ts](../../../server/api/tree.post.ts), [server/api/intake.post.ts](../../../server/api/intake.post.ts) | Read the two headers and pass `analytics` into the handler |
| [server/utils/llm-handlers.ts:158](../../../server/utils/llm-handlers.ts#L158), [:198-200](../../../server/utils/llm-handlers.ts#L198-L200), [:347-352](../../../server/utils/llm-handlers.ts#L347-L352) | Optional `analytics` input and `recordGenerated` dep. One `identity` (browser's, else the user id) feeds both the model call's context and the generated event. The event is awaited in a try before the 200, with `cached` true on a cache hit |
| [server/utils/llm-runtime.ts](../../../server/utils/llm-runtime.ts) | `recordGenerated` sends `skill_path_generated` with `start_level` and `cached` |
| [server/utils/intake-handlers.ts:185](../../../server/utils/intake-handlers.ts#L185) | Optional `analytics` input; the context uses the browser's id, else the user id |
| [tests/unit/analytics-identity.test.ts](../../../tests/unit/analytics-identity.test.ts) | New. Id rules, header reading, `analyticsHeaders` with and without a client and with a throwing client, and the browser to server round trip |
| [tests/unit/tree-route.test.ts](../../../tests/unit/tree-route.test.ts) | New block "analytics identity": browser ids used; user id fallback for `undefined` and `null`; `cached` true on a cache hit; no event on a failed build; a throwing event still gives the same 200; with a foreign id, limiter key, save, call order and body equal those without |
| [tests/unit/path-intake-route.test.ts](../../../tests/unit/path-intake-route.test.ts) | New block: browser ids used, limiter still keyed by the user, fallback to the user id |
| [tests/property/sample-path-identity.property.test.ts](../../../tests/property/sample-path-identity.property.test.ts) | New. Property 6, 100 runs each: any header pair reads to null or a usable identity; the tree handler's model call and event use the browser id when there is one, else the user id, and the limiter stays keyed by the user |

- **Must not change:** S1 to S4. Background jobs keep `createAiObservabilityContext()` with no argument ([video/pipeline.ts:104](../../../server/utils/video/pipeline.ts#L104), [fresh/check.ts:260](../../../server/utils/fresh/check.ts#L260), [llm-handlers.ts:353](../../../server/utils/llm-handlers.ts#L353)). The response bodies and the PostHog logs of [server/utils/posthog-logs.ts](../../../server/utils/posthog-logs.ts) stay as they are.
- **Related, not changed:** [app/composables/useAuth.ts](../../../app/composables/useAuth.ts) (identify stays for signed in accounts only; identifying anonymous users with the Supabase id would merge persons across devices and is not needed once the server uses the browser id). [server/utils/posthog-logs.ts](../../../server/utils/posthog-logs.ts) (logs, not events; they carry no person).
- **Watch for:**
  - **One change from the first design:** the design passed the generated event's data back through a `meta` field on the handler result. The code uses an optional dep, `recordGenerated`, instead: the result shape stays the same, and tests use a fake dep as for `afterSave`. design.md and tasks.md were updated with the plan (2026-11-23).
  - **The posthog-js tracing extension** (`tracing_headers` in the plugin) sets the same header names on same-origin requests. It uses `headers.set`, so both write the same value and never a combined one. It also skips `$posthog_cookieless`, as `usableAnalyticsId` does.
  - The event is awaited before the response, like the existing `logSkillPathRequest`, because a Vercel function may stop work left after the response. The client has a 2 s request timeout and no retry, so the worst case adds 2 s to a build of about 20 s, only when PostHog is down.
  - The server event has no browser properties (`$host`, `$pathname`, utm). Funnels join on the person, so this is fine; a breakdown of `skill_path_generated` by utm will need the person's first touch properties instead.
  - Existing funnels built on the browser's `skill_path_generated` keep working: the name and `start_level` stay.

### G2. Sample data and the converter script (task 2; Req 1.1 to 1.3, 2, 10.6)

The three Sample_Files, written by a committed script from the export, with the schema that checks them and the tree the path components will draw.

| File | Why it changed |
|---|---|
| [data/sample-paths.json](../../../data/sample-paths.json) | The export as supplied by the owner, unchanged. Kept as the source (decision 16) |
| [scripts/build-sample-paths.mjs](../../../scripts/build-sample-paths.mjs) | New. Export to `data/samples/<slug>.json`. Checks the shape, writes nothing on any error, fixed key order, skips unchanged files, warns about a missing slug. `convertExport` is exported and pure, so the test runs it; `main` runs only when called as a script |
| [package.json](../../../package.json) | `yarn samples` runs the script. A script entry, no dependency |
| [data/samples/README.md](../../../data/samples/README.md) | New. How to refresh the samples, and that the files are not edited by hand |
| [data/samples/photography.json](../../../data/samples/photography.json), [guitar.json](../../../data/samples/guitar.json), [birdwatching.json](../../../data/samples/birdwatching.json) | New, generated. Run twice: the second run printed "unchanged" for all three |
| [shared/types/sample-path.ts](../../../shared/types/sample-path.ts) | New. `SampleSlug`, `SamplePath`, `SampleSection`, `SampleSkill`, `SampleVideo` |
| [shared/utils/sample-slugs.ts](../../../shared/utils/sample-slugs.ts) | New. `SAMPLE_SLUGS`, `isSampleSlug`, `hobbyTextFromSlug`, `CAMPAIGN_KEYS`, `campaignQuery`, `unknownSlugTarget`. In `shared/` because `nuxt.config.ts` will read the slugs |
| [shared/utils/sample-path.ts](../../../shared/utils/sample-path.ts) | New. Strict zod schema of Req 2.3 with a compile time drift check against the type; `parseSamplePath` adds the slug and unique id checks; `sampleToTree` (each skill needs the one before it); `sampleCounts` |
| [app/utils/sample-paths.ts](../../../app/utils/sample-paths.ts) | New. Static imports of the three files and `getSample`, checked once per page load; a file that fails reads as null, so the route will treat the slug as unknown |
| [tests/arbitraries.ts](../../../tests/arbitraries.ts) | `arbSamplePath`: 1 to 4 sections, 1 to 8 skills each, 0 to 3 videos, some unknown outfits |
| [tests/unit/sample-files.test.ts](../../../tests/unit/sample-files.test.ts) | New. The three real files pass, no dash in their path text, counts; broken files rejected; script slugs equal the app's; **the committed files equal what the script makes from the committed export**, so a hand edit or a forgotten `yarn samples` fails the suite; error reporting of the script |
| [tests/property/sample-path-data.property.test.ts](../../../tests/property/sample-path-data.property.test.ts) | New. Property 1 (route decision) and Property 2 (Sample to tree), 100 runs each |
| [tests/unit/sample-layout.test.ts](../../../tests/unit/sample-layout.test.ts) | New. Acceptance check 7: all three files on both viewports, no overlap, no node in a header band, every node inside a 360 px column (640 px on desktop) and every label at full width |

- **Related, not changed:** [app/utils/path-layout.ts](../../../app/utils/path-layout.ts) and [shared/utils/progress-engine.ts](../../../shared/utils/progress-engine.ts) handle the sample tree as is; no change was needed.
- **Watch for:**
  - **Long final milestone titles may be cut on phones.** The layout leaves every label its full 104 px at 360 px (widest node edge 42 px right of centre, so 120 px are free). But the last skill of each file is titled with the finish line, 42 to 51 characters, and the label clamps at 3 lines, as on the real path screen. "Take 10 portraits with a clearly blurred background" likely shows with an ellipsis. The full title stays in the button's accessible name and in the preview. To be checked in task 6 and manual row B5; options then: accept it, or let the preview mode clamp at 4 lines.
  - Tests are not type checked in this project (only `tests/nuxt/` is in the type check), so the `@ts-expect-error` on the `.mjs` import in `sample-files.test.ts` is not verified by `yarn typecheck`.
  - `hobbyTextFromSlug` allows letters of any script, so `/try/ölçüm` gives "ölçüm".

### G3. The route without a session (task 3; Req 1, 3.1, 3.2, 3.7)

`/try/<slug>` starts no session; the three sample slugs are static pages with noindex; any other slug answers 302 to `/new` with the hobby filled and nothing started.

| File | Why it changed |
|---|---|
| [app/utils/session-start.ts](../../../app/utils/session-start.ts) | New. `startsSession(path, query)`: false for Demo_Mode (moved here unchanged) and for `/try` and every `/try/…` path |
| [app/middleware/auth.global.ts](../../../app/middleware/auth.global.ts) | Calls `startsSession` instead of its own demo check |
| [app/utils/sample-route.ts](../../../app/utils/sample-route.ts) | New. `sampleRedirect(slug, query)`: null for a sample slug whose file loads, else the `/new` target. Takes no session or account |
| [app/middleware/sample-slug.ts](../../../app/middleware/sample-slug.ts) | New. Named route middleware: the 302 on the server, a replace in the browser |
| [app/pages/try/[hobby].vue](../../../app/pages/try/%5Bhobby%5D.vue) | New. Shell only: the middleware, the title "<Hobby> sample path · Pursio", robots noindex, and the hobby and finish line. The real page comes in tasks 5 to 8 |
| [app/utils/sample-copy.ts](../../../app/utils/sample-copy.ts) | New. The copy module, with the page title so far; task 5.2 adds the rest |
| [nuxt.config.ts](../../../nuxt.config.ts) | `routeRules` prerender the three sample pages, from `SAMPLE_SLUGS` |
| [app/utils/landing.ts](../../../app/utils/landing.ts) | `hobbyHandoffStep(query, sessionReady)`: the handoff decision of `/new` as a pure function (`none`, `fill` with `start=0`, `wait`, `start`). `withoutHobbyQuery` also drops `start` |
| [app/pages/new.vue](../../../app/pages/new.vue) | The handoff effect acts on `hobbyHandoffStep`. With `start=0` it fills the hobby at once and sends nothing; otherwise as before, `start()` still runs before the URL is rewritten |
| [tests/unit/sample-route.test.ts](../../../tests/unit/sample-route.test.ts) | New. Acceptance check 2: `/try/unknown` goes to `/new` with the hobby and `start=0`; slug to hobby text; campaign params; the handoff steps; `withoutHobbyQuery` |
| [tests/unit/sample-no-cost.test.ts](../../../tests/unit/sample-no-cost.test.ts) | New. Acceptance checks 1 and 3, first part: no session for any `/try/` path and any query (100 runs); demo unchanged; sessions elsewhere, `/new` included; the middleware calls the rule |

- **Related, not changed:** [app/composables/useAuth.ts](../../../app/composables/useAuth.ts) (builds the Supabase client only in `ensure()`, which no longer runs on `/try/`); [app/plugins/cloud.client.ts](../../../app/plugins/cloud.client.ts) (watches the user id, which stays empty; checked in task 11.2).
- **Watch for:**
  - **Free plan limit with `start=0`:** `new.vue` shows the limit card instead of the form when the account is at 3 hobbies and the URL has no `hobby`. After the `start=0` fill the URL has none, so an account at the limit sees the card even when the slug names a hobby it already has. Typing that hobby on `/new` behaves the same today, so this is not new behavior. Only reachable from an unknown slug.
  - The static guard over the page's own files (no auth, cloud or API code) waits for task 11.1, when the page has its components.

### G4. Preview_Mode of the shared components, copy and view helpers (task 5; Req 5.2 to 5.7, 6, 7.4, 7.5, 9.1, 9.2, 13)

Optional props on the path and new hobby components, each off by default, and the pure helpers that will feed them on the sample page.

| File | Why it changed |
|---|---|
| [app/utils/path-preview.ts](../../../app/utils/path-preview.ts) | New. `CanvasPreview` and `PreviewHeader` types. Kept apart from the sample code, so the path components import nothing sample specific (a change from design.md, which put them in `sample-view.ts`; design.md updated) |
| [app/components/path/PathCanvas.vue](../../../app/components/path/PathCanvas.vue) | Optional `preview`. With it: sub labels, header texts and the tag come from it, and nodes get `statusText`. Without it: the same `statusLine` and `sectionHeaderModels` as before. The header view became a flat object so both sources fit one template |
| [app/components/path/PathNode.vue](../../../app/components/path/PathNode.vue) | Optional `statusText` for the accessible name; absent, the progress status as before |
| [app/components/path/PathNextUpTag.vue](../../../app/components/path/PathNextUpTag.vue) | Optional `label`; with it the tag fits its text, without it "NEXT UP" at the fixed width |
| [app/components/path/PathSectionHeader.vue](../../../app/components/path/PathSectionHeader.vue) | Optional `countText` (banner) and `note` (divider, no lock icon); each falls back to today's count and lock line |
| [app/components/path/PathFinishLine.vue](../../../app/components/path/PathFinishLine.vue) | Optional `plain`: flag, eyebrow and title in a `p`; no count, bar or reached state |
| [app/components/path/PathQuestItem.vue](../../../app/components/path/PathQuestItem.vue) | Optional `readonly`: a `div` row with no checkbox, no focus, no pointer. Without it the same `label`, input and classes as before |
| [app/components/hobby/HobbyNoteField.vue](../../../app/components/hobby/HobbyNoteField.vue) | Optional `label`, `hint` (null hides "optional"), `placeholder` and `labelStyle`; the defaults are the intake texts and look |
| [app/utils/sample-copy.ts](../../../app/utils/sample-copy.ts) | Every string of Requirement 13, with singular forms and the owner's placeholders (decision 15); founding line marked as a draft |
| [app/utils/sample-view.ts](../../../app/utils/sample-view.ts) | New. `introLine`, `canvasPreview`, `previewModel`, `toRankedVideo`, `firstSkillId` |
| [tests/unit/sample-copy.test.ts](../../../tests/unit/sample-copy.test.ts) | New. Exact texts, placeholders, no dash in any string, and a key list that fails when a string is added without its dash check |
| [tests/unit/sample-view.test.ts](../../../tests/unit/sample-view.test.ts) | New. The real files' intro lines and labels as in the mockup; divider lines with and without a milestone before; singular forms; acceptance check 4: a skill without videos gives an empty list |
| [tests/property/sample-path-preview.property.test.ts](../../../tests/property/sample-path-preview.property.test.ts) | New. Property 3, 100 runs |

- **Related, not changed:** [app/utils/node-visual.ts](../../../app/utils/node-visual.ts) and [app/utils/section-headers.ts](../../../app/utils/section-headers.ts), still used whenever `preview` is absent; their tests ran unchanged and pass.
- **Watch for:**
  - No component test environment exists, so "default output unchanged" rests on reading the diffs: each new prop is optional and every template branch falls back to the old markup. `PathQuestItem` keeps its classes, now split into a base and a conditional part.
  - The "START HERE" tag sits above the node, where "NEXT UP" sits on the path screen. The desktop mockup puts it beside the title. Kept above the node to reuse the existing tag position without a layout change.
  - A first skill that is a milestone gets its content line ("3 quests · 2 videos"), not "Milestone". No supplied file starts with a milestone.

### G5. The page: top bar, intro card, path and finish card (task 6; Req 4, 5, 6, 14.5)

The sample page now draws the whole path as in the mockups. The right column (preview, Make it yours) is an empty placeholder until tasks 7 and 8.

| File | Why it changed |
|---|---|
| [app/components/sample/SampleTopBar.vue](../../../app/components/sample/SampleTopBar.vue) | New. Logo with the new hobby page's markup, dashed "SAMPLE PATH" tag; desktop only "Log in" link to `/path` and `AppButton` "Build my own path", which emits `buildOwn` |
| [app/components/sample/SampleIntroCard.vue](../../../app/components/sample/SampleIntroCard.vue) | New. Wick in the file's outfit (hidden from screen readers), the counted line, the finish line as the only `h1` (22 px on phones, 32 px on desktop), the help text |
| [app/components/sample/SampleView.vue](../../../app/components/sample/SampleView.vue) | New. Tree, empty Progress and node states made once; `usePathLayout` and `useViewportClass` as on the path screen; `PathCanvas` in Preview_Mode with the first skill selected; loading and error from `PathStatus`; `PathFinishLine` plain. Imports no auth, cloud, video or API code |
| [app/pages/try/[hobby].vue](../../../app/pages/try/%5Bhobby%5D.vue) | Renders `SampleView` instead of the task 3 shell |
| [app/utils/sample-copy.ts](../../../app/utils/sample-copy.ts) | "Loading the path…" and "This path could not be drawn." (`PathStatus` says "Loading your path…" by default, which is wrong here) |
| [app/utils/sample-view.ts](../../../app/utils/sample-view.ts) | `finishView` for the plain finish card; `canvasPreview` asks for 5 title lines |
| [app/utils/path-preview.ts](../../../app/utils/path-preview.ts), [app/components/path/PathCanvas.vue](../../../app/components/path/PathCanvas.vue), [app/components/path/PathNodeLabel.vue](../../../app/components/path/PathNodeLabel.vue) | Optional `titleLines` / `sideLines`: a preview may allow 4 or 5 title lines; the path screen keeps 3 |
| [tests/unit/sample-copy.test.ts](../../../tests/unit/sample-copy.test.ts), [tests/unit/sample-view.test.ts](../../../tests/unit/sample-view.test.ts) | The two new strings in the dash check; `titleLines` is 5 |

- **Watch for:**
  - The "long final milestone title" point of G2 is solved here: with 3 lines the photography title showed as "Take 10 portraits with a clearly…" at 360 px; with 5 it shows in full and does not touch the label above (screenshots below).
  - The right column is empty on desktop until task 7, so the path column sits left of centre.
  - Mobile keeps `pb-24` under the path for the sticky bar of task 8.

### G6. Skill preview and selection (task 7; Req 7, 8, 3.4)

| File | Why it changed |
|---|---|
| [app/components/sample/SampleSkillPreview.vue](../../../app/components/sample/SampleSkillPreview.vue) | New. Tag ("FIRST SKILL" tinted, "PREVIEW" neutral) with "Section s · Skill k", title, description, "3 QUESTS" with "+10 XP EACH" from `XP_PER_QUEST`, the quests as read only `PathQuestItem` rows, the videos, and a slot for the end of the sheet. Same card look as the path screen's skill detail, without its chip, lock note and button |
| [app/components/sample/SampleVideoList.vue](../../../app/components/sample/SampleVideoList.vue) | New. `WatchVideoCard` in list layout with `WatchEmbedPlayer` and "Close video", as in `WatchSection` but with no recorder and no listener on play, progress or skip; the pointer cursor for the reused buttons comes from the list; with no video, the one fallback line |
| [app/components/sample/SampleView.vue](../../../app/components/sample/SampleView.vue) | Desktop: `PathSidePanel` with the selected skill, first skill by default, a click on another skill selects it and stops any video. Mobile: a tap opens `PathBottomSheet`; closing stops the video and returns focus to the node through the canvas' `focusNode`. A change of viewport keeps the selection and opens no sheet. The right column takes back the side panel's own right padding so the cards line up with the top bar |
| [tests/unit/sample-no-cost.test.ts](../../../tests/unit/sample-no-cost.test.ts) | The video list listens to no play, progress, pause, end or skip signal, and uses neither the recorder nor `WatchSection` |

- **Related, not changed:** [app/components/watch/WatchSection.vue](../../../app/components/watch/WatchSection.vue), the source of the card and player markup, which records events through `useVideoEvents`, so it is not reused.
- **Watch for:**
  - "Make this path mine" at the end of the skill sheet is built in task 8 with the sheet it opens (tasks.md updated).
  - Videos whose title holds a hyphen (4 of 12) show it as published (decision 13).

### G7. Make it yours (task 8; Req 4.3, 7.8, 9)

| File | Why it changed |
|---|---|
| [app/components/sample/SampleMineBox.vue](../../../app/components/sample/SampleMineBox.vue) | New. Heading, the new hobby page's `HobbyNoteField` with the sample label, no "optional", and the hobby's placeholder (grows with its text, 800 limit, counter), `AppButton` "Build my path" in a form, a slot for Skip, the small line. Desktop: tinted card with the primary border. Exposes `focusNote`; emits `noteFocus` for task 10's event |
| [app/components/sample/SampleMineBar.vue](../../../app/components/sample/SampleMineBar.vue) | New. Fixed bottom bar with the safe area; below 380 px only the button, full width |
| [app/components/sample/SampleFoundingLine.vue](../../../app/components/sample/SampleFoundingLine.vue) | New. Desktop line, draft wording, plain link to `/?landing=1#founding`, 44 px hit area; reads no state |
| [app/components/sample/SampleView.vue](../../../app/components/sample/SampleView.vue) | One `note` for both layouts. Desktop: the right column is now its own sticky aside, one screen minus the top bar, the preview scrolling inside it, the box and the founding line always in view; "Build my own path" focuses the note. Mobile: the bar, the Make it yours sheet with Skip, "Make this path mine" at the end of the skill sheet; focus returns to the bar button or to the skill's node. A change of viewport closes both sheets. `build()` is a stub until task 10 |
| [app/components/sample/SampleTopBar.vue](../../../app/components/sample/SampleTopBar.vue) | 80 px tall on desktop (82 with the border), the height the aside is sized against |

- **Watch for:**
  - **The side panel is no longer reused** (it was in G6): it is one full screen tall, which with this page's top bar put the bottom 82 px of the column, the Make it yours box, out of view at load. design.md updated.
  - **The mobile bar below 380 px shows only the button.** Requirement 9.4 updated. The sheet repeats "Free to try. No signup."
  - Both build buttons and Skip do nothing until task 10, so this commit must not ship on its own; it is not linked from anywhere yet.
  - The mine sheet puts first focus on its close button, as the skill sheet does (`PathBottomSheet`), not in the textarea, so a phone's keyboard does not jump up on open.

### G8. Handoff and events (task 10; Req 10, 11)

| File | Why it changed |
|---|---|
| [app/utils/sample-handoff.ts](../../../app/utils/sample-handoff.ts) | New. `handoffTarget` (`/new` with the hobby and the Campaign_Params, never the note); `setSampleHandoff` keeps the trimmed note, cut to 800, in a module variable; `takeSampleHandoff` gives it once, for the same hobby after normalizing, within 60 s, and clears it either way |
| [app/utils/sample-events.ts](../../../app/utils/sample-events.ts) | New. `utmProps` (the five utm keys, 1 to 200 characters) and `createSampleTracker`: viewed, mine opened and build clicked once per page load, skill opened each time. Its API takes no note |
| [app/utils/analytics.ts](../../../app/utils/analytics.ts) | The four event names |
| [app/components/sample/SampleView.vue](../../../app/components/sample/SampleView.vue) | `sample_viewed` on mount; `sample_skill_opened` on a desktop change of skill and on each mobile sheet opening; `sample_mine_opened` from the bar, the skill sheet, the top bar button or the first note focus on desktop; `build()` sends `sample_build_clicked` with `has_note` and `skipped`, sets the handoff and navigates, once, and works again if the navigation is refused |
| [app/pages/new.vue](../../../app/pages/new.vue) | On the `start` step of the hobby handoff, the note comes from `takeSampleHandoff` before `start()`; `start=0` never takes it |
| [tests/unit/sample-handoff.test.ts](../../../tests/unit/sample-handoff.test.ts) | New. Acceptance check 5: with a note, `/new` gets the hobby and the note and starts intake, no word of the note is in the URL, utm stays after `hobby` is removed; refresh, session wait, Skip, spaces, other hobby, 60 s, clock going back, 800 cut, `start=0` |
| [tests/unit/sample-events.test.ts](../../../tests/unit/sample-events.test.ts) | New. Acceptance check 6: the walk through sends each event once with the hobby and utm; once-only rules; `utmProps`; the page sends `sample_viewed` after mount and passes no note to the tracker |
| [tests/property/sample-path-handoff.property.test.ts](../../../tests/property/sample-path-handoff.property.test.ts) | New. Properties 4 and 5, 100 runs each |

- **Related, not changed:** [app/composables/useHobbyBuilder.ts](../../../app/composables/useHobbyBuilder.ts): `start()` reads the note after its first await, so setting it just before the call is enough; everything after it (intake, Panel, generation, limit card, errors) is the existing flow (Req 10.8).
- **Watch for:**
  - The visitor sees `/new`'s loading state while the session starts, then the form with the hobby and the note filled while Wick reads, then the Panel: never the empty input state (Req 10.4).
  - PostHog keeps its own cookie and storage keys on the sample page. Requirement 3.5 is about the page's own storage; analytics is allowed by Requirement 3.3.

### G9. Guards (task 11; Req 3.1, 3.4, 3.5, 14.4, 14.6)

| File | Why it changed |
|---|---|
| [tests/unit/sample-no-cost.test.ts](../../../tests/unit/sample-no-cost.test.ts) | The page, its components and every `app/utils/sample-*.ts` use none of `useAuth`, `useCloudStore`, `useSkillVideos`, `useVideoEvents`, `useHobbyBuilder`, `useBillingStatus`, `useFoundingCheckout`, `useAuthDialog`, `getSupabase`, `WatchSection`, `AuthSessionGate`, `$fetch`, `fetch(`, `/api/`, `localStorage`, `sessionStorage`, `document.cookie` (comments excluded); every `button`, `a`, `NuxtLink` and `AppButton` of the sample components has `cursor-pointer` |
| [tests/unit/conventions.test.ts](../../../tests/unit/conventions.test.ts) | Scans `app/components/sample/` and the page for literal colors, fonts, radii, shadows and emoji, as for the path, quests, Fresh and pricing screens |
| [app/components/sample/SampleTopBar.vue](../../../app/components/sample/SampleTopBar.vue) | `rounded-[14px]`, copied from the new hobby page's header, is a literal radius; now `rounded-2xl`. Caught by the scan |
| [app/components/sample/SampleVideoList.vue](../../../app/components/sample/SampleVideoList.vue) | "Close video" carries `cursor-pointer` itself, so the pointer rule needs no exception |

- **Not changed on purpose:** [app/pages/new.vue](../../../app/pages/new.vue) keeps its `rounded-[14px]`; it is outside this spec and outside the scan.
- **Task 11.2:** the plugins that run on every page (`cloud.client.ts`, `useChannelMutes`, `paddle-retain.client.ts`) were checked in a browser in G8: no Supabase or API request before the press. No guard was needed. V3 and V5 marked answered in scenarios.md.

### G10. Phone layout of the top bar and intro card (owner feedback, 2026-11-23)

The owner asked for the "SAMPLE PATH" tag at the right edge on phones, and found the intro card too long and crowded.

| File | Why it changed |
|---|---|
| [app/components/sample/SampleTopBar.vue](../../../app/components/sample/SampleTopBar.vue) | The tag sits at the right edge below `lg` and next to the logo from `lg`, as in the mobile and desktop mockups. Two copies with one shared class, only one shown at a time |
| [app/components/sample/SampleIntroCard.vue](../../../app/components/sample/SampleIntroCard.vue) | A grid: on phones Wick (48 px) and the counted line share the top row, and the heading and the help text (14 px) take the full width below; from `lg` Wick spans the three rows on the left as before. Wick's CSS width overrides its width attribute; its viewBox keeps the shape |

- **Result:** at 360 px the guitar intro card is about 220 px tall instead of about 540; desktop unchanged (screenshots at 360, 390 and 1440 px).
- **Smaller bar button (owner, 2026-11-23):** [app/components/AppButton.vue](../../../app/components/AppButton.vue) gains `size="sm"`: 44 px tall, the smallest that keeps the tap target, 16 px side padding, 15 px text; `md` and `lg` unchanged. [SampleMineBar.vue](../../../app/components/sample/SampleMineBar.vue) uses it, so "Make it yours", "Free. No signup." and the button fit side by side at 360 px and the full width fallback of G7 is gone (Requirement 9.4 back to its first wording). Below 380 px the bar heading is 16 px instead of 17.

## Decisions

1. **Where `skill_path_generated` is sent.** Decided 2026-11-23 (OD1, decision 13): server only, with the browser's distinct id.

No open decision in this group.

## Not changed on purpose

- Past events are not rewritten. Server events before the fix stay under separate persons, so funnels that include `$ai_generation` or that start before the deploy undercount for anonymous visitors.
- No `identify` for anonymous visitors (see "Related, not changed").
- The `tracing_headers` option stays in the plugin; nothing depends on it.
- **Sample page:** no change to path generation, prompts, the video pipeline, billing or the database (Req 15.1). The real path screen only gained optional props that are off by default (G4). `/new` changed only in its hobby handoff (G3, G8) and the analytics headers (G1).
- `data/sample-paths.json` stays in the repo as the source of the samples; the converter script is committed (decision 16).
- `app/pages/new.vue` keeps its literal `rounded-[14px]`; it is outside this spec.
- No browser test framework was added (decision 13). The browser checks in Verification were run by hand with a throwaway script, not committed.

## Verification

- **Run:** `yarn typecheck`: 0 errors before and after. `yarn test`: 1415 passed, 16 skipped before; 1434 passed, 16 skipped after (19 new tests, none changed).
- **The tests catch the bug:** with the old line `createAiObservabilityContext(userId)` put back in the tree handler, 2 of the new tests fail (the browser id case and Property 6). The fix was then restored.
- **Not run:** lint (the project has no linter configured). No request against a real PostHog; F4 is checked on production after the deploy.
- **G2, run:** `yarn samples` twice (written, then unchanged). `yarn typecheck`: 0 errors. `yarn test`: 1476 passed, 16 skipped (42 new in G2).
- **G3, run:** `yarn typecheck`: 0 errors. `yarn test`: 1507 passed, 16 skipped (31 new). `yarn build` (Vercel preset): the prerenderer made `/try/guitar`, `/try/photography` and `/try/birdwatching` with their payloads; the HTML holds the title, `<meta name="robots" content="noindex">` and the finish line; Vercel routing serves static files first and sends any other `/try/<slug>` to the `[hobby]` function (V3 answered). Against the dev server: `/try/calligraphy?utm_source=reddit&utm_campaign=t1` → 302 `/new?utm_source=reddit&utm_campaign=t1&hobby=calligraphy&start=0`; `/try/film-photography` → `hobby=film+photography`; `/try/---` → `/new`; `/try/Guitar` → `hobby=Guitar`; `/try/guitar?utm_source=reddit` → 200.
- **G3, not run:** a browser pass of `/new?hobby=calligraphy&start=0` (field filled, no intake request): manual row A3.
- **G4, run:** `yarn typecheck`: 0 errors. `yarn test`: 1521 passed, 16 skipped (14 new; the path component tests unchanged and green). Dev server: `/path?demo=1`, `/new`, `/quests` and `/try/guitar` answer 200 with no render error.
- **G4, not run:** a visual comparison of `/path` before and after; the components with `preview` off are checked by hand in the manual pass.
- **G5, run:** `yarn typecheck`: 0 errors. `yarn test`: 1521 passed, 16 skipped. Screenshots against the dev server with headless Chrome driven through the DevTools protocol (a real 360 px device viewport; a plain `--window-size` cannot go below about 500 px): desktop 1440 px for photography matches the desktop mockup's left column; 360 px for photography (3 sections, 14 skills), birdwatching (2, 13) and guitar (2, 9) has `scrollWidth` equal to the viewport (no sideways scroll), no overlap, every title and the finish card in full.
- **G5, not run:** other themes, a screen reader pass; both in the manual pass.
- **G6, run:** `yarn typecheck`: 0 errors. `yarn test`: 1523 passed, 16 skipped (2 new). Screenshots: desktop 1440 px matches the desktop mockup's right column (tag, position, quests with empty boxes, two video cards) and lines up with the top bar; 360 px after a tap on "Aperture and background blur" shows the sheet as in the "Skill tapped" mockup, with "Videos appear when you reach this skill." and no videos heading.
- **G6, not run:** playing a video (needs a real YouTube embed), focus return and Escape with a keyboard; manual rows C3, C5, C7.
- **G7, run:** `yarn typecheck`: 0 errors. `yarn test`: 1523 passed. Screenshots: desktop 1440×900, the box, the button and the founding line fully in view with the first skill's preview scrolling above them; 360 px, the bar as one full-width button, the Make it yours sheet as in its mockup with the photography placeholder, Skip and the small line; 390 px, the bar as in the mockup; guitar at 360 px, the finish card clear of the bar.
- **G7, not run:** typing, the counter, focus return, Escape; manual rows D2 to D7.
- **G8, run:** `yarn typecheck`: 0 errors. `yarn test`: 1541 passed, 16 skipped (18 new). A real browser with a fresh profile against the dev server (Chrome through the DevTools protocol): `/try/guitar?utm_source=reddit&utm_campaign=t1` loaded, a skill opened, a note typed. **Before the press**, the only hosts were `localhost:3000`, `fonts.googleapis.com`, `fonts.gstatic.com`, `i.ytimg.com` and `eu-assets.i.posthog.com`: no Supabase request, no `/api/` request (acceptance check 1, manual row A1 in part); storage held only PostHog's keys. **After "Build my path"**, the URL was `/new?utm_source=reddit&utm_campaign=t1&hobby=Guitar`, with no word of the note (acceptance check 5, in part). The first request after the press was the anonymous sign up to Supabase, blocked by the script on purpose so the check created no user and spent no model call.
- **G9, run:** `yarn typecheck`: 0 errors. `yarn test`: 1561 passed, 16 skipped (20 new).
- **Final (task 14):** `yarn typecheck`: 0 errors. `yarn test`: 1561 passed, 16 skipped, against 1415 passed before this spec (146 new tests; existing test files changed only by additions: the route tests of G1, the shared generators in `tests/arbitraries.ts` of G2, and the conventions scan of G9).
- **G8, not run:** the rest of acceptance check 5 in a browser (the note filled on `/new`, intake, the Panel), because it needs a real session and an intake call; manual row E1, in the launch gate. The events in PostHog live events: manual row F1, in the launch gate.

## Manual checks before release

**Analytics fix (G1), on production after the deploy:**

- [ ] F4: clear site data, open `/?utm_source=test`, type a hobby, build. In PostHog, the person holds `landing_viewed`, `intake_shown`, `intake_answered`, `skill_path_generated` and the `$ai_generation` events under one distinct id (Req 12.7).
- [ ] F4b: start a build and close the tab after 15 s. `skill_path_generated` still appears.
- [ ] F5: block PostHog in the browser, build. The path builds; server events appear under the user id.
- [ ] S1: signed in account, build. Events stay on the same person as before.

**Sample page launch gate (decision 17): all four before the ad links go live.**

- [x] A1 (dev server, 2026-11-23): a fresh browser on `/try/guitar?utm_source=reddit&utm_campaign=t1` sent no Supabase and no `/api/` request, and stored nothing but PostHog's keys, until "Build my path". Repeat once on the production build or preview, since the static file is what ad visitors get.
- [x] B5 (dev server, 2026-11-23): photography (3 sections, 14 skills), birdwatching (2, 13) and guitar (2, 9) at a true 360 px viewport and at 1440 px: no sideways scroll, no overlap, every title and the finish card in full, the bar clear of the finish card.
- [ ] E1 (owner): on `/try/guitar?utm_source=reddit`, write a note, press "Build my path". `/new` shows its loading state, then the hobby and the note filled while Wick reads, then the Panel with chips. The URL holds `utm_source` and no part of the note at every step. Needs a real session and an intake call.
- [ ] F1 (owner): with PostHog live events open, view a sample, open a skill, open Make it yours, build. Four events, once each, with `hobby` and the utm properties, no note.

**After launch (decision 17):** every other row of the manual matrix in [design.md](design.md), in the three themes, with a keyboard and a screen reader for both sheets. Record each here as it is done; a failing row becomes a bug in [KNOWN_BUGS.md](../../../KNOWN_BUGS.md).

- [ ] A2, A3, A4, A5, A6, A7, A8, A9
- [ ] B1, B2, B3, B4, B6 (compare with the four mockups)
- [ ] C1 to C10
- [ ] D1 to D7
- [ ] E2 to E11 (E7 answers V2)
- [ ] F2, F3, F4, F5
- [ ] V4: every video of the three files plays in the embed
- [ ] V6: confirmed in B5

## Follow-ups

- After the deploy: the F4 check, then set "Fixed in" of APP-ANALYTICS-01 in [KNOWN_BUGS.md](../../../KNOWN_BUGS.md) to `f5101ed` and the release.
- The founding line uses the draft wording "Founding members keep Plus for life. See the offer" until the owner confirms it (decision 14); only `app/utils/sample-copy.ts` and its test change.
- The fallback placeholder for other hobbies is a draft; no current page shows it.
- The pages carry `noindex` for now; removing it is one line in `app/pages/try/[hobby].vue`.
- When a new export with more videos arrives: replace `data/sample-paths.json`, `yarn samples`, `yarn test`, then check the videos (manual row C5).
- The `CHANGELOG.md` entry is written and left unstaged: staging it triggers the release.
