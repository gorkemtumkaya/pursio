# Implementation Plan: Sample path page

## Overview

The plan follows the module layout of [design.md](design.md). Order:

1. The analytics bug (APP-ANALYTICS-01), first and on its own, as the owner asked. It follows the bug rule: plan, stop for review, then fix.
2. Sample data: files, schema, the tree.
3. The route, with no session on it.
4. Preview_Mode of the shared path components.
5. The page: top bar, intro, path, finish card.
6. The skill preview and its videos.
7. Make it yours.
8. The handoff into `/new`.
9. The four events.
10. Remaining tests, the manual pass, the change summary.

After task 5 the three pages already render the full path. Each later step adds one visible part, so the work can stop for review at any checkpoint.

Code is TypeScript (strict, no `any`), with `<script setup lang="ts">` for Vue files. Styling uses theme token utilities only. Every new control carries `cursor-pointer`. No new dependency is added; Playwright is not added for now (decision 13). Commands are `yarn typecheck`, `yarn test` and, for the samples, `yarn samples`.

Test conventions:
- Property tests go in `tests/property/sample-path-*.property.test.ts`, each with at least 100 runs and the tag comment `// Feature: sample-path, Property N: <title>`.
- Example tests go in `tests/unit/sample-*.test.ts`, or extend the existing file of the module they touch.
- Components and composables are tested through pure helpers, because no Nuxt or component test environment exists.

Do not commit. Staging `CHANGELOG.md` triggers an automatic release. Real env files are never read.

The owner answered OD1 to OD6 on 2026-11-23 (scenarios.md, decisions 13 to 17). The one open point is the wording of the founding line, which uses the draft in Requirement 13 until the owner confirms it.

## Tasks

- [ ] 1. Fix the funnel chain (bug APP-ANALYTICS-01)
  - [x] 1.1 Plan and stop for review
    - Start `.kiro/specs/sample-path/changes.md` with the scenario rows F4 to F6, one planned group for the bug (cause: server events use the Supabase user id, the browser uses PostHog's id; the generated event is browser only), the findings table of Requirement 12, and decision 13 (server only, recorded as decided on 2026-11-23, not as planned)
    - Stop until the owner has reviewed the plan
    - _Requirements: 12_
  - [x] 1.2 Send the browser's ids with the two build requests
    - `analyticsHeaders` in `app/utils/analytics.ts`
    - `useHobbyBuilder`: spread it into the headers of `/api/intake` and `/api/tree`; remove the browser capture of `skill_path_generated` (decision 13)
    - _Requirements: 12.1, 12.4_
  - [x] 1.3 Use the identity on the server
    - `server/utils/analytics-events.ts`: `readAnalyticsIdentity`, `captureServerEvent`
    - `tree.post.ts`, `intake.post.ts`: read the two headers, pass `analytics` into the handler
    - `llm-handlers.ts`, `intake-handlers.ts`: `createAiObservabilityContext(analytics?.distinctId ?? userId, analytics?.sessionId)`; the tree handler awaits the optional dep `recordGenerated` before its 200 return, in a try
    - `ai-observability.ts`: optional session id in the context, sent as `$session_id`
    - `llm-runtime.ts`: wire `recordGenerated` to `captureServerEvent(..., 'skill_path_generated', { start_level, cached })`
    - Background jobs keep `createAiObservabilityContext()` with no argument
    - _Requirements: 12.2, 12.3, 12.5, 12.6_
  - [x] 1.4 Write the tests
    - `tests/unit/analytics-identity.test.ts`: header parsing, the fallback, `analyticsHeaders` with and without a client
    - Extend `tree-route.test.ts` and `path-intake-route.test.ts`: identity passed in, user id fallback, `recordGenerated` once on 200 with `cached` true on a cache hit, never on an error, and a throwing `recordGenerated` still gives 200
    - **Property 6: Server identity**
    - **Validates: Requirements 12.2, 12.3**
  - [ ] 1.5 Close the bug records
    - `KNOWN_BUGS.md`: move APP-ANALYTICS-01 to Fixed, with the introducing commit (`git log -S"skill_path_generated" --reverse`), the impact and the analytics impact (server events before the fix cannot be joined to browser events)
    - `changes.md`: the group set to Done, with files and what was run
    - `CHANGELOG.md`: no entry, the change is not visible to users
    - After the deploy, the owner does the walk through of Requirement 12.7 and the result goes into `changes.md`
    - _Requirements: 12.7_

- [x] 2. Sample data
  - [x] 2.1 Write the converter script and run it
    - `scripts/build-sample-paths.mjs` as in design.md, "Converter script": reads `data/sample-paths.json`, checks the shape, writes `data/samples/<slug>.json` with keys in the order of Requirement 2.1; writes nothing on any failure; same input gives the same bytes
    - `package.json`: add `"samples": "node scripts/build-sample-paths.mjs"` (a script entry, no dependency)
    - `data/samples/README.md`: the refresh steps (replace the export, `yarn samples`, `yarn test`)
    - Keep `data/sample-paths.json` in the repo as the source; it is committed with this work
    - Run it, then run it again and check with `git status` that the second run changed nothing
    - _Requirements: 2.1, 2.8 to 2.10_
  - [x] 2.2 Add types, slugs and the schema
    - `shared/types/sample-path.ts`
    - `shared/utils/sample-slugs.ts`: `SAMPLE_SLUGS`, `isSampleSlug`, `hobbyTextFromSlug`, `CAMPAIGN_KEYS`, `campaignQuery`, `unknownSlugTarget`
    - `shared/utils/sample-path.ts`: `samplePathSchema`, `parseSamplePath`, `sampleToTree`, `sampleCounts`
    - `app/utils/sample-paths.ts`: static imports and `getSample`
    - _Requirements: 1.1 to 1.3, 2.2 to 2.7, 10.6_
  - [x] 2.3 Write the data tests
    - `tests/unit/sample-files.test.ts`: the three real files parse; slug equals file name; a file with a bad field, a repeated id or 2 quests is rejected; an empty `videos` list is valid; no Dash_Character in the path text
    - Add a Sample generator to `tests/arbitraries.ts`
    - **Property 1: Route decision**
    - **Property 2: Sample to tree**
    - **Validates: Requirements 1.1 to 1.3, 2.3 to 2.7, 5.1, 5.3, 5.4, 10.6**
  - [x] 2.4 Write the layout test (acceptance check 7)
    - `tests/unit/sample-layout.test.ts`: photography (3 sections, 14 skills) and guitar (2 sections, 9 skills), mobile and desktop, `computePathLayout` succeeds, with the overlap assertions already used in `path-layout.test.ts`, and label widths for a 360 px column
    - _Requirements: 2.5, 14.5, 16.7_

- [x] 3. Route without a session
  - [x] 3.1 Add `startsSession` and use it in the global middleware
    - `app/utils/session-start.ts`; `auth.global.ts` calls it; the two demo conditions move into it unchanged
    - _Requirements: 3.1, 3.2, 3.7_
  - [x] 3.2 Add the page shell
    - `app/pages/try/[hobby].vue`: the inline middleware with the 302, the head (title, `robots: noindex`), a placeholder body
    - `nuxt.config.ts`: `routeRules` from `SAMPLE_SLUGS` with `prerender: true`
    - Run `yarn build` and check that the three pages are static files and that another slug is not (V3)
    - _Requirements: 1.1, 1.2, 1.4, 1.6 to 1.9_
  - [x] 3.3 Let `/new` fill a hobby without starting
    - `new.vue`: the `start=0` branch of the handoff effect; `withoutHobbyQuery` also drops `start`
    - _Requirements: 1.5_
  - [x] 3.4 Write the route tests (acceptance checks 1, 2 and 3, first part)
    - `tests/unit/sample-route.test.ts`: `unknownSlugTarget` for calligraphy, film-photography, Guitar, `---`, a slug with `<`, with and without Campaign_Params
    - `tests/unit/sample-no-cost.test.ts`: `startsSession` is false for every `/try/` path and any query, true for `/new`, `/path`, `/`, and false for the two demo URLs as before
    - Extend `landing` tests for `withoutHobbyQuery`
    - _Requirements: 16.1 to 16.3_

- [x] 4. Checkpoint - the three URLs answer, other slugs redirect, no session starts
  - Run `yarn typecheck` and `yarn test`, and ask the user if questions arise.

- [x] 5. Preview_Mode of the shared components
  - [x] 5.1 Add the optional props
    - `PathCanvas`: `preview?: CanvasPreview`; `PathNode`: `statusText?`; `PathNextUpTag`: `label?`; `PathSectionHeader`: `countText?`, `note?`; `PathFinishLine`: `plain?`; `PathQuestItem`: `readonly?`; `HobbyNoteField`: `label?`, `hint?`, `placeholder?`
    - Every default keeps today's markup and classes
    - _Requirements: 5.7, 6.3, 15.2_
  - [x] 5.2 Add the view helpers and the copy module
    - `app/utils/sample-copy.ts` with the table of Requirement 13
    - `app/utils/sample-view.ts`: `canvasPreview`, `previewModel`, `toRankedVideo`, `introLine`
    - _Requirements: 4.5, 5.2, 5.5, 7.4, 8.6, 13.1_
  - [x] 5.3 Write the tests
    - `tests/unit/sample-copy.test.ts`: the strings, and no Dash_Character
    - `tests/unit/sample-view.test.ts`: `canvasPreview` and `previewModel` for the three real files; the divider lines for 2, 3 and 4 sections and for a section with no milestone before it; a skill with no video (acceptance check 4); singular forms
    - **Property 3: Preview labels**
    - Run the existing `node-visual`, `section-headers`, `path-layout`, `finish-line` and `conventions` tests unchanged
    - **Validates: Requirements 5.2, 5.5, 13.2, 16.4**

- [x] 6. The page
  - [x] 6.1 Build `SampleTopBar` and `SampleIntroCard`
    - Top bar: the logo markup and classes of the `/new` header, the dashed tag, on desktop the "Log in" link to `/path` (decision 13) and `AppButton` "Build my own path"
    - Intro card: Wick with `toWickOutfit(sample.mascot)`, the intro line, the `h1`, the help text; compare with the mockups
    - _Requirements: 4.1 to 4.7, 3.6_
  - [x] 6.2 Build `SampleView` with the path and the finish card
    - Tree from `sampleToTree`, states from `deriveNodeStates(tree, emptyProgress())`, `usePathLayout`, `useViewportClass`, `PathCanvas` with `preview`, `PathStatus` for loading and error, `PathFinishLine` with `plain`
    - Grid and container of design.md, "Layout"; no sidebar, no bottom navigation
    - _Requirements: 5.1 to 5.6, 5.8, 5.9, 6.1, 6.2_

- [x] 7. Skill preview
  - [x] 7.1 Build `SampleSkillPreview` and `SampleVideoList`
    - Tag, position, title, description, the quest heading with the XP constant, three `PathQuestItem` with `readonly`
    - `WatchVideoCard` with `layout="list"` and `WatchEmbedPlayer` in its slot, no handler on play, progress or skip; the wrapper with `[&_button]:cursor-pointer`; the fallback line when the list is empty
    - _Requirements: 7.4 to 7.6, 8.1 to 8.6, 3.4_
  - [x] 7.2 Wire selection and the skill sheet
    - Desktop: `PathSidePanel`, default selection, outline
    - Mobile: `PathBottomSheet`, opener for focus return. "Make this path mine" moved to 8.2, where the sheet it opens is built
    - Closing or changing skill clears the active video; selection survives a viewport change
    - _Requirements: 7.1 to 7.3, 7.7 to 7.9, 8.3_

- [x] 8. Make it yours
  - [x] 8.1 Build `SampleMineBox` and `SampleMineBar`
    - Box: heading, `HobbyNoteField` with the label and the slug's placeholder, `AppButton` "Build my path", the small line, a slot for Skip; exposes `focusNote`
    - Desktop card tint; check contrast with `contrast.test.ts`, add a token to every theme if one is missing
    - `SampleFoundingLine`: desktop only, the draft copy and a `NuxtLink` to `/?landing=1#founding`; no state, no request
    - Bar: fixed bottom, safe area, "Make it yours", "Free. No signup.", `AppButton` "Tell Wick where I am"
    - _Requirements: 9.1 to 9.5, 9.8 to 9.11_
  - [x] 8.2 Wire the box into `SampleView`
    - Desktop: under the preview in the right column, preview scrolls, box always in view
    - Mobile: the Mine_Sheet with the Skip text button; focus return to the opener or to the skill's node
    - "Build my own path" focuses the note; one `note` ref for both layouts
    - "Make this path mine" at the end of the skill sheet: closes it and opens the Mine_Sheet (Req 7.8)
    - _Requirements: 4.3, 9.3, 9.4, 9.6, 9.7_

- [x] 9. Checkpoint - the page matches the four mockups on desktop and at 360 px
  - Run `yarn typecheck` and `yarn test`, and ask the user if questions arise.

- [x] 10. Handoff and events
  - [x] 10.1 Implement the handoff
    - `app/utils/sample-handoff.ts`: `handoffTarget`, `setSampleHandoff`, `takeSampleHandoff`
    - `SampleView.build(skipped)` with the `leaving` guard
    - `new.vue`: `note.value = takeSampleHandoff(value) ?? ''` before `start()`
    - _Requirements: 10.1 to 10.9_
  - [x] 10.2 Implement the events
    - `analytics.ts`: the four names; `app/utils/sample-events.ts`: `utmProps`, `createSampleTracker`
    - `SampleView`: `viewed()` on mount; skill, mine and build calls as in Requirement 11
    - _Requirements: 11.1 to 11.8_
  - [x] 10.3 Write the handoff and event tests (acceptance checks 5 and 6)
    - `tests/unit/sample-handoff.test.ts`: target for a hobby with and without Campaign_Params; take once; other hobby; after 60 s; a note of spaces; the flow helper: note taken, `start` called once, `start=0` calls nothing
    - `tests/unit/sample-events.test.ts`: the walk through view, skill, mine, build gives each event once with `hobby` and the utm properties; no utm in the URL gives none
    - **Property 4: Handoff never leaks the note**
    - **Property 5: Events**
    - **Validates: Requirements 10.1 to 10.6, 11.2 to 11.7, 16.5, 16.6**

- [ ] 11. Guards
  - [ ] 11.1 Write the static guards
    - `sample-no-cost.test.ts`: the forbidden names of design.md, "No cost before intent", over `app/components/sample/`, the page and `app/utils/sample-*.ts`
    - `tests/unit/sample-conventions.test.ts`: `cursor-pointer` on every control of `app/components/sample/*.vue`; add the folder and the page to the scan of `conventions.test.ts`
    - _Requirements: 3.1, 3.4, 3.5, 14.4, 14.6, 16.1, 16.8_
  - [ ] 11.2 Check the pieces that run on every page (V5)
    - Read `plugins/cloud.client.ts` and `useChannelMutes` with no session and confirm in the network tab that nothing is sent; if something is, guard it with `startsSession` and add a test
    - _Requirements: 3.1_

- [ ] 12. Manual pass (launch gate, then the rest)
  - [ ] 12.1 Launch gate: rows A1, B5, E1 and F1 of the manual matrix
    - A1: cleared storage, network tab, no request to Supabase, `/api/*` or a model
    - B5: photography and guitar at 360 px and 1280 px, no overlap, no sideways scroll
    - E1: build with a note lands on the Panel, the note is in no URL, utm kept
    - F1: the four events once each in PostHog live events, with `hobby` and utm
    - All four pass before the ad links go live; write the results into `changes.md`
    - _Requirements: 16.10_
  - [ ] 12.2 After launch: the rest of the manual matrix
    - Every other row, on desktop and at 360 px; the page in all three themes; keyboard only; a screen reader for both sheets
    - Compare with the four mockups in `dev_docs/`
    - Answer V2, V4 and V6 of scenarios.md
    - Track each row in `changes.md` under "Manual checks after launch" as it is done; a failing row becomes a bug in `KNOWN_BUGS.md`
    - _Requirements: 14.1 to 14.7, 16.9, 16.10_

- [ ] 13. Change summary and changelog
  - [ ] 13.1 Finish `.kiro/specs/sample-path/changes.md`
    - Groups by purpose (bug fix, data and script, route, shared components, page, handoff, events), each file with its reason, the review order, what was not changed on purpose, what was run and what was not, the launch gate results of 12.1, and an empty "Manual checks after launch" list of the remaining rows for 12.2
    - Write it while doing the work, and finish it here
  - [ ] 13.2 Add the `CHANGELOG.md` entry under "## [Unreleased]"
    - Added: one line for the sample path pages, written for a user, with "(spec: sample-path)"
    - Do not stage the file

- [ ] 14. Final checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and `yarn test`, and ask the user if questions arise.

## Notes

- Task 1 is a bug fix and follows `bug-fixes.md`: 1.1 is a real stop. Tasks 2 and later do not depend on it and can be reviewed separately.
- There is no browser test (decision 13). Acceptance checks 1, 3, 5 and 6 rest on helper tests, the static guards and the manual matrix rows A1, A2, E1 and F1.
- The pages carry `noindex` for now. Removing it later is a one line change in the page head.
- `/new` still starts an anonymous session when it opens, as today. A hit on an unknown `/try/<slug>` therefore creates one after the redirect. This is existing behavior (see APP-SEC-01) and outside this spec.
- The videos of a Sample are a copy. If YouTube removes one, the card shows the player's failure state until the file is edited.
- The founding line (decision 14) uses the draft wording of Requirement 13. When the owner confirms the wording, only `app/utils/sample-copy.ts` and its copy test change.
- When a refreshed export arrives: replace `data/sample-paths.json`, run `yarn samples`, run `yarn test`, and check the new videos with manual row C5.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2"] },
    { "id": 2, "tasks": ["1.4", "2.3", "2.4", "3.2", "3.3", "5.1"] },
    { "id": 3, "tasks": ["1.5", "3.4", "5.2"] },
    { "id": 4, "tasks": ["5.3", "6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["7.1", "8.1"] },
    { "id": 7, "tasks": ["7.2"] },
    { "id": 8, "tasks": ["8.2"] },
    { "id": 9, "tasks": ["10.1", "10.2"] },
    { "id": 10, "tasks": ["10.3", "11.1", "11.2"] },
    { "id": 11, "tasks": ["12.1"] },
    { "id": 12, "tasks": ["13.1", "13.2"] },
    { "id": 13, "tasks": ["12.2"] }
  ]
}
```
