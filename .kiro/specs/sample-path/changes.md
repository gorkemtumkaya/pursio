# Changes: Sample path page

Implementation of the `sample-path` spec ([scenarios](scenarios.md), [requirements](requirements.md), [design](design.md), [tasks](tasks.md)). This file grows with the work. So far it covers task 1, the analytics bug APP-ANALYTICS-01, which the owner asked to fix first and on its own (plan reviewed by the owner on 2026-11-23 before the code changed), and task 2, the sample data.

- **Repos and branches:** `pursio`. G1 was made on `fix/analytics-funnel-chain` and merged into `main`; everything after it is on `main`
- **State:** G1 committed in `f5101ed` and merged into `main` (fast forward) on 2026-11-23; checked alone in a clean worktree: 1434 passed, 16 skipped. Spec documents in `9fccee2`. G2 in `6afec4a`. G3 in `43dac82`. G4 in `42c4730`. G5 committed with this update. From G2 on, work is on `main` and each separate task is committed when done (owner, 2026-11-23)
- **Status:** 1 of 1 done *(bug fixes)*; the production check F4 waits for the deploy
- **Size:** G1: 9 files changed, 4 added. G2: 2 files changed, 13 added (incl. 3 generated data files). G3: 4 files changed, 7 added. G4: 7 files changed, 5 added. G5: 7 files changed, 3 added. 5 groups

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

## Decisions

1. **Where `skill_path_generated` is sent.** Decided 2026-11-23 (OD1, decision 13): server only, with the browser's distinct id.

No open decision in this group.

## Not changed on purpose

- Past events are not rewritten. Server events before the fix stay under separate persons, so funnels that include `$ai_generation` or that start before the deploy undercount for anonymous visitors.
- No `identify` for anonymous visitors (see "Related, not changed").
- The `tracing_headers` option stays in the plugin; nothing depends on it.

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

## Manual checks before release

- [ ] F4: on production after the deploy, clear site data, open `/?utm_source=test`, type a hobby, build. In PostHog, the person holds `landing_viewed`, `intake_shown`, `intake_answered`, `skill_path_generated` and the `$ai_generation` events under one distinct id (Req 12.7).
- [ ] F4b: start a build and close the tab after 15 s. `skill_path_generated` still appears.
- [ ] F5: block PostHog in the browser, build. The path builds; server events appear under the user id.
- [ ] S1: signed in account, build. Events stay on the same person as before.

## Follow-ups

- After the deploy: move APP-ANALYTICS-01 to Fixed in [KNOWN_BUGS.md](../../../KNOWN_BUGS.md) with the commit and the result of the F4 check.
- Then task 2 of the spec (sample data).
