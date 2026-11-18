# Implementation Plan: Landing Page

## Overview

Build the landing page at `/` in TypeScript (Nuxt 4, Vue 3, `<script setup lang="ts">`), following the owner decisions of 2026-11-18: the decision at `/` depends on Saved_Paths (not on sign in), the server always renders the landing, a Head_Script shows the loader before first paint when the device has a Path_Hint, analytics go to PostHog through one `track()` function, and `/new?hobby=` starts a path once at `DEFAULT_LEVEL` and then removes `hobby` from the URL.

The work starts with the pure modules (analytics, landing logic, copy, Path_Hint), which hold every rule that can be tested in Vitest's `node` environment. The Head_Script and the CSS variant come next, then the section components, the wiring in `index.vue`, the three legal pages and the handoff in `new.vue`. Documentation closes the plan.

Requirements: [requirements.md](./requirements.md). Design: [design.md](./design.md).

Notes for the implementer:
- No new dependency, no runtime config key (Req 14.7). Token utilities only, no hardcoded colors, fonts or shadows (Req 14.1).
- No Dash_Character in any Visible_Copy (Req 14.5). All text comes from `app/utils/landing-copy.ts`.
- `public/og.png` is supplied by the owner. The page only references it; no task creates or generates it, and its 1200 by 630 size is a manual check before release.

## Tasks

- [x] 1. Pure modules: analytics, landing logic and copy
  - [x] 1.1 Create `app/utils/analytics.ts`
    - Export `AnalyticsEvent` (`landing_viewed`, `hero_hobby_submitted`, `example_hobby_clicked`, `demo_clicked`), `AnalyticsProps` and `AnalyticsClient = Pick<PostHog, 'capture'>` (type import from `posthog-js`, already a dependency)
    - `sendEvent(client, event, properties?)`: return at once when the client is `null` or `undefined`; otherwise call `client.capture(event, properties)` inside `try`/`catch`; never log, never throw
    - `track(event, properties?)`: call `sendEvent(tryUseNuxtApp()?.$posthog, event, properties)` inside `try`/`catch`, so it returns normally on the server, in tests and when the PostHog key or host is not configured
    - Do not change the existing direct `$posthog?.capture(...)` calls in `useHobbyBuilder` and `useCloudStore`
    - _Requirements: 15.1, 15.2, 15.5, 15.6, 15.7_

  - [x] 1.2 Create `app/utils/landing.ts`
    - Export `HOBBY_MAX_LENGTH` (60), `NEW_PAGE`, `DEMO_PATH`, `SITE_URL` (`https://pursio.fun`), `PathCheck`, `LandingView` as in the design
    - `pathCheckOf(auth, cloud, pathCount)`: `failed` for auth `unavailable` or cloud `error`, `pending` while auth is `loading` or cloud is `idle`, `loading` or `importing`, `has_paths` / `no_paths` when cloud is `ready` (archived paths count)
    - `decideLanding({ landing, hint, check })`: `landing` when `landing === '1'`; else `redirect` for `has_paths`, `landing` for `no_paths`, `retry` or `landing` for `failed` depending on `hint`, `pending` otherwise
    - `normalizeHobby(raw)`, `landingHandoffUrl(hobby)`, `parseHobbyQuery(value)` (first array element, trim, cut to 60, trim again, `null` when blank) and `withoutHobbyQuery(query)` (drops only `hobby`)
    - Import `SessionStatus` from `~/utils/auth-logic`, `CloudStatus` from `~/composables/useCloudStore` and `LocationQuery` / `LocationQueryRaw` from `vue-router` as types only
    - _Requirements: 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 3.5, 3.6, 6.2, 11.1, 11.2, 11.5_

  - [x] 1.3 Create `app/utils/landing-copy.ts`
    - Export `LANDING_TITLE` (`Pursio · Type a hobby. Get a path.`, middle dot), `LANDING_DESCRIPTION`, `LANDING_COPY` (headline, subline, placeholder, empty message, step titles and lines, Fresh text, footer text, alt texts, ARIA labels), `EXAMPLE_HOBBIES` (eight labels in order), `FAQ_ITEMS` (four items, wording from Assumptions 8 to 11), `LEGAL_PLACEHOLDER` and three Fresh_Preview sample rows of its own (not `FRESH_SAMPLES`, whose titles contain a hyphen)
    - Use no Dash_Character, price, plan name, user count, review or partner
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 5.2, 6.1, 8.1, 8.3, 8.4, 8.5, 9.4, 10.3, 12.1, 12.2, 14.5, 14.6_

  - [ ]* 1.4 Write property test for the landing decision
    - File: `tests/property/landing-decision.property.test.ts`
    - Generate auth status, cloud status, path count, Path_Hint and `landing` query value; check `decideLanding(pathCheckOf(...))` against the decision table, that `pending` never depends on the hint, and that `landing_viewed` is only due for the `landing` view
    - **Property 1: Landing decision**
    - **Validates: Requirements 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 15.3, 15.4**

  - [ ]* 1.5 Write property test for hobby normalization
    - File: `tests/property/landing-hobby.property.test.ts`
    - **Property 2: Hobby normalization**
    - **Validates: Requirements 3.5, 3.6, 3.11**

  - [ ]* 1.6 Write property test for the handoff round trip
    - File: `tests/property/landing-hobby.property.test.ts` (same file as 1.5)
    - Include spaces, `&`, `=`, `#`, `?`, `%`, non-ASCII text and every `EXAMPLE_HOBBIES` label
    - **Property 3: Handoff round trip**
    - **Validates: Requirements 3.5, 6.2**

  - [ ]* 1.7 Write property test for hobby query parsing
    - File: `tests/property/landing-hobby-query.property.test.ts`
    - **Property 4: Hobby query parsing**
    - **Validates: Requirements 11.1, 11.2**

  - [ ]* 1.8 Write property test for hobby removal from the query
    - File: `tests/property/landing-hobby-query.property.test.ts` (same file as 1.7)
    - **Property 8: Hobby removal keeps the rest of the query**
    - **Validates: Requirements 11.5, 11.6**

  - [ ]* 1.9 Write property test for copy rules
    - File: `tests/property/landing-copy.property.test.ts`
    - **Property 5: Copy has no dash and no price**
    - **Validates: Requirements 8.4, 10.3, 14.5, 14.6**

  - [ ]* 1.10 Write property test for the analytics wrapper
    - File: `tests/property/landing-analytics.property.test.ts`
    - Use a fake client, `undefined`, `null` and a client whose `capture` throws any value; spy on `console` to check that nothing is written; call `track` with no Nuxt app
    - **Property 6: Analytics sends or stays silent**
    - **Validates: Requirements 15.2, 15.5, 15.6, 15.7**

  - [ ]* 1.11 Write unit tests for copy constants
    - File: `tests/unit/landing-copy.test.ts`
    - Check `EXAMPLE_HOBBIES` order, `FAQ_ITEMS` question order, that the videos answer mentions YouTube, picked and checked, plays from YouTube and nothing copied, and that the hobbies answer says any hobby, craft, sport or skill works
    - _Requirements: 6.1, 8.1, 8.3, 8.5_

  - [ ]* 1.12 Write unit test for archived paths
    - File: `tests/unit/landing.test.ts`
    - `pathCheckOf('signed_in', 'ready', n)` with only archived paths gives `has_paths`, and `decideLanding` gives `redirect` (Assumption 24)
    - _Requirements: 1.2_

- [x] 2. Path_Hint before first paint
  - [x] 2.1 Create `shared/utils/path-hint.ts`
    - Export `PATH_HINT_ATTR` (`data-path-hint`), `PATH_HINT_KEYS` (`pursio-active-hobby:v1`, `pursio-hobbies:v1` as literals, since `nuxt.config.ts` cannot import from `app/`)
    - `hasPathHint(read, pathname, search)`: true only when `pathname` is `/`, `landing` is not `1` and one key holds a non-empty value; a throwing read counts as no hint
    - `pathHintInitScript`: hand-written ES5 string built with `JSON.stringify` from the constants, in `try`/`catch`, that sets `data-path-hint=""` on `<html>` under the same rule (pattern of `themeInitScript`)
    - _Requirements: 1.3, 1.5, 1.7_

  - [x] 2.2 Add the Head_Script in `nuxt.config.ts`
    - Import `pathHintInitScript` and add it to `app.head.script` after the theme script, with `tagPosition: 'head'`
    - Add no `runtimeConfig` key
    - _Requirements: 1.5, 1.7, 14.7_

  - [x] 2.3 Add the CSS variant in `app/assets/css/main.css`
    - Add `@custom-variant path-hint (&:where(html[data-path-hint] *));`, with no color or token
    - _Requirements: 1.5, 1.7_

  - [ ]* 2.4 Write property test for the Head_Script
    - File: `tests/property/landing-path-hint.property.test.ts`
    - Run `pathHintInitScript` against a fake `localStorage`, `location` and `document` (absent, empty, non-empty and throwing storage; search with and without `landing=1`) and compare with `hasPathHint`; the script never throws
    - **Property 7: Head_Script agrees with the Path_Hint rule**
    - **Validates: Requirements 1.3, 1.5, 1.7**

  - [ ]* 2.5 Write unit test for the hint keys
    - File: `tests/unit/path-hint.test.ts`
    - `PATH_HINT_KEYS` equals `[ACTIVE_HOBBY_KEY, HOBBY_LIBRARY_KEY]` from `app/utils/active-hobby.ts` and `app/utils/hobby-store.ts`, so the Head_Script cannot drift from the app's storage keys
    - _Requirements: 1.5, 1.7_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Section components in `app/components/landing/`
  - [x] 4.1 Create `LandingHeader.vue`
    - Logo (`public/logo/App icon 1024-192.png`, 32 px, with `width` and `height`) and "Pursio" on the left
    - "Try the demo" `NuxtLink` to `DEMO_PATH`, hidden below 700 px (`max-[699px]:hidden`), calls `track('demo_clicked')` on click
    - "Build your path" `NuxtLink` to `NEW_PAGE` styled as the primary button, not tracked
    - Tap targets of at least 44 px and the existing focus outline
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 13.2, 13.4, 13.5, 15.5_

  - [x] 4.2 Create `LandingPathPreview.vue`
    - Static `aria-hidden="true"` column of done, done, current, locked and milestone nodes as plain `div`s with `nodeVisual()` classes and `PathIcon`, plus `MascotWick` with `outfit="bouldering"`, the `useTheme()` theme, `:animated="false"`
    - No link, button, input or `tabindex`
    - _Requirements: 3.10, 14.3, 14.4_

  - [x] 4.3 Create `LandingHero.vue`
    - The only `h1`, the subline, a labelled input (`maxlength` 60, placeholder from copy), "Build my path" submit, `role="alert"` message area, and "See an example path" link that calls `track('demo_clicked')`
    - On submit use `normalizeHobby`: when null, show "Type a hobby to start.", focus the input, stay and send nothing; otherwise `track('hero_hobby_submitted', { length })` and `navigateTo(landingHandoffUrl(text))`, never sending the text
    - `LandingPathPreview` beside the text from 700 px (`min-[700px]:grid-cols-2`) and below it on narrower screens
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.11, 13.2, 13.3, 13.5, 15.5_

  - [x] 4.4 Create `LandingHowItWorks.vue`
    - An `h2` and an ordered list of three steps with the titles "Type any hobby", "Do small quests" and "Watch what helps" and one line each from the copy module
    - _Requirements: 4.1, 4.2_

  - [x] 4.5 Create `LandingFreshPreview.vue` and `LandingFresh.vue`
    - Preview: `aria-hidden="true"` static card list of the three sample rows from the copy module, with no `a`, `button`, `input` or `tabindex`
    - Section: the text "New videos for your skills, every day. Checked for your level, sorted into your path." beside the preview
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 4.6 Create `LandingChips.vue`
    - Eight `button type="button"` chips in `EXAMPLE_HOBBIES` order, `min-h-11`, with the focus outline
    - On click: `track('example_hobby_clicked', { hobby })`, then `navigateTo(landingHandoffUrl(hobby))`
    - _Requirements: 6.1, 6.2, 13.2, 13.5, 15.5_

  - [x] 4.7 Create `LandingFounding.vue` and `LandingFaq.vue`
    - Founding: `<section id="founding" aria-hidden="true">` containing only the comment `<!-- waitlist goes here -->`, no text, heading or focusable child
    - FAQ: four native `details`/`summary` items from `FAQ_ITEMS`, `summary` with `min-h-11` and the focus outline
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 8.5, 13.2, 13.5_

  - [x] 4.8 Create `LandingFooter.vue` and `LegalPage.vue`
    - Footer: logo image with `width` and `height`, links Privacy, Terms and Refund (`NuxtLink`), "Source code" to `https://github.com/gorkemtumkaya/pursio` with `rel="noopener"`, and "Built for Kiroween 2026"
    - LegalPage: prop `title`; `LandingHeader`, `main` with one `h1`, `LEGAL_PLACEHOLDER`, a `NuxtLink` "Back to Pursio" to `/`, and `LandingFooter`; set the page title with `useHead`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3, 13.4_

  - [x] 4.9 Create `LandingView.vue`
    - Compose the eight sections in order: Header, Hero, How_It_Works, Fresh_Highlight, Example_Chips, Founding_Section, FAQ, Footer
    - Root with `overflow-x-clip` so nothing scrolls sideways at 390 px
    - Send no analytics here: it also renders in the `pending` shell, so `index.vue` sends `landing_viewed`
    - _Requirements: 1.1, 13.1_

- [x] 5. Pages and wiring
  - [x] 5.1 Update `app/pages/index.vue`
    - On the client, compute `hint` with `hasPathHint((key) => localStorage.getItem(key), location.pathname, location.search)`, toggle `PATH_HINT_ATTR` on `<html>` to match, and remove it in `onBeforeUnmount`
    - `check = pathCheckOf(auth.status, cloud.status, cloud.paths.length)` and `view = decideLanding({ landing: route.query.landing, hint, check })`
    - Template: `pending` renders the loader (`hidden path-hint:block`) and `LandingView` (`path-hint:hidden`); `landing` renders `LandingView`; `retry` renders `AuthRetryNotice` with `AUTH_MESSAGES.unavailable` / `auth.retry` or `CLOUD_MESSAGES.loadFailed` / `cloud.reload`; `redirect` renders `PathStatus state="loading"`; drop `AuthSessionGate` from this page
    - Keep the Existing_Redirect in this file with the same target (`lastActivePath(...) ?? NEW_HOBBY_PATH`, `replace: true`), now triggered by a `watch(view, ...)` when `view` is `redirect`
    - A second `watch(view, ...)` with a `viewedSent` flag calls `track('landing_viewed')` once when `view` becomes `landing`, on the client only
    - Set `useHead` (title, canonical `https://pursio.fun/`) and `useSeoMeta` (description, `og:title`, `og:description`, `og:type` website, `og:url`, `og:image` `https://pursio.fun/og.png`, width 1200, height 630) with literal values; reference `og.png` only
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 12.1, 12.2, 12.3, 12.4, 12.6, 14.7, 15.3, 15.4_

  - [x] 5.2 Create `app/pages/privacy.vue`, `terms.vue` and `refund.vue`
    - Each renders `<LegalPage title="..." />` with the names Privacy, Terms and Refund
    - _Requirements: 10.1, 10.2_

  - [x] 5.3 Update `app/pages/new.vue` for the hobby handoff
    - Add the one-shot `watchEffect` from the design: `parseHobbyQuery(route.query.hobby)`; on `null` set `handoffDone` and change nothing; otherwise wait for an `anonymous` or `signed_in` session, set `handoffDone`, `hobby.value`, `level.value = DEFAULT_LEVEL` (from `shared/utils/llm.ts`), call `build()` once, then `router.replace({ query: withoutHobbyQuery(route.query) })`
    - A failed build is not retried; refresh and back reach `/new` without `hobby` and start nothing
    - Leave the hobby builder, level picker and error handling unchanged
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 5.4 Write source scan tests
    - File: `tests/unit/landing-source.test.ts`
    - In `app/components/landing/` and the three legal pages: no hex color, `font-family` or colored `shadow-[`; every `<img` has `width` and `height`; exactly one `<h1` across the landing components other than `LegalPage.vue`; no `<a`, `<button`, `<input` or `tabindex` in `LandingFreshPreview.vue` and `LandingPathPreview.vue`
    - _Requirements: 5.3, 13.3, 13.4, 14.1_

- [x] 6. Checkpoint - Ensure all tests pass
  - Run `yarn typecheck` and the unit suite, and lint the changed files.
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Documentation per project rules
  - [x] 7.1 Add the `CHANGELOG.md` entries
    - Under `## [Unreleased]`: in Added, one user-facing line for the new landing page (type a hobby or pick an example to get a path, FAQ, placeholder legal pages); in Changed, one line for `/` sending returning visitors with saved paths to their path and `/new` starting a path from a hobby in the link; each ending with "(spec: landing-page)"
    - Do not rewrite existing entries. Staging `CHANGELOG.md` in a commit triggers the release hook, so leave committing to the owner
    - _Requirements: 1.1, 1.2, 10.1, 11.1_

  - [x] 7.2 Write `.kiro/specs/landing-page/changes.md`
    - Use the change-summaries template: header, review order, groups by purpose (analytics wrapper, landing logic and copy, Path_Hint and Head_Script, sections, index wiring, legal pages, new-page handoff), a file table with a one-line reason per file as Markdown links relative to `changes.md`, related files not changed (`posthog.client.ts`, `useHobbyBuilder`, `useCloudStore`, `AuthSessionGate`)
    - Decisions dated 2026-11-18: Saved_Paths decide the redirect, server renders the landing, PostHog is live, `hobby` is removed from the URL, the owner supplies `og.png`
    - Not changed on purpose, verification run and not run, and manual checks from the design's test matrix, including that `public/og.png` exists and is 1200 by 630
    - Link to `requirements.md` and `design.md` instead of repeating them
    - _Requirements: 1.1, 12.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests (minimum 100 runs each, tagged "Feature: landing-page, Property N") validate the universal properties in the design; unit and source scan tests cover examples
- `public/og.png` is not produced by any task; Req 12.5 is checked by hand once the owner adds the file
- Task 7 follows the project rules: `CHANGELOG.md` under Unreleased and `changes.md` for the batch

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "2.1"] },
    { "id": 1, "tasks": ["1.4", "1.5", "1.7", "1.9", "1.10", "1.11", "1.12", "2.2", "2.3", "2.4", "2.5", "4.1", "4.2", "4.4", "4.5", "4.6", "4.7", "5.3"] },
    { "id": 2, "tasks": ["1.6", "1.8", "4.3", "4.8"] },
    { "id": 3, "tasks": ["4.9", "5.2"] },
    { "id": 4, "tasks": ["5.1", "5.4"] },
    { "id": 5, "tasks": ["7.1", "7.2"] }
  ]
}
```
