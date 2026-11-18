# Requirements Document

> **Design update, 2026-11-18:** the built page follows the HTML mockup in `dev_docs/Landing page · Desktop-html` and `dev_docs/Landing page · Mobile-html`. Where the mockup and this document differ (sections, header, copy, chips, footer), the mockup wins. The differences and the open founding section decision are listed in [changes.md](changes.md), Decisions 6 and 7. Requirements 2, 3.7, 3.8, 4, 5, 6, 8 and 9 are not yet rewritten.

## Introduction

The Landing_Page is the public front door of Pursio at `/`. A visitor reads what Pursio does, types a hobby or picks an example, and is handed to the New_Hobby_Page, which starts building the path at once. The page follows the "Landing" design as seen in `dev_docs/Landing page · Desktop@1x.png` and `dev_docs/Landing page · Mobile@1x.png` (the canvas files are not in the repo). Placeholder Legal_Pages are included because the footer links to them.

This spec covers only the owner's request: the page and its eight sections, the routing at `/`, the page metadata, the analytics calls, the three placeholder pages, and the small change to the New_Hobby_Page that reads a hobby from the URL and then removes it. There is no checkout, no payment link, no email form, no waitlist endpoint or table and no rate limiting. The Founding_Section is an empty anchor for later work.

Process note: the per-feature rule asks for `scenarios.md` before requirements. This spec was requested as a quick spec, so scenarios are not written separately. The Assumptions section at the end of this file lists every assumption for owner review.

## Glossary

- **Landing_Page**: The page rendered at `/` (`app/pages/index.vue`) for visitors who have no Saved_Path, and for every visitor at `/?landing=1`.
- **Visitor**: A person who opens `/`, anonymous or signed in with an account.
- **Auth_Service**: The existing `useAuth()` composable, which exposes the session status. The session starts in the browser after hydration; during server rendering the status is `loading`.
- **Cloud_Store**: The existing `useCloudStore()` composable, which loads the current user's Path_Rows from Supabase in the browser (spec: accounts-cloud-save).
- **Saved_Path**: A Path_Row of the current user (anonymous or signed in) as loaded by the Cloud_Store, archived or not. Saved_Paths are stored only in Supabase, so the server cannot read them.
- **Path_Check**: The existing session start by the Auth_Service followed by the Cloud_Store load of the user's Path_Rows (which also imports Legacy_Data, as today). The Path_Check runs in the browser only. It ends with the Cloud_Store status `ready`, or fails with the Auth_Service status `unavailable` or the Cloud_Store status `error`.
- **Path_Hint**: Local data on this device that suggests Saved_Paths exist: localStorage holds a non-empty Active_Hobby id under `pursio-active-hobby:v1`, or holds Legacy_Data (spec: accounts-cloud-save) such as `pursio-hobbies:v1`. The Path_Hint is a guess; the Path_Check decides.
- **Head_Script**: A small inline script in the document head that runs before first paint, like the existing theme script in `nuxt.config.ts`.
- **Existing_Redirect**: The logic already in `app/pages/index.vue` that sends a user to their last active path, or to the New_Hobby_Page when there is none.
- **New_Hobby_Page**: The existing page at `/new` (`app/pages/new.vue`) that builds a path from a hobby.
- **Hobby_Handoff**: Opening `/new?hobby=<hobby>`, where `<hobby>` is the URL-encoded hobby text.
- **Demo_Path**: The existing sample bouldering path at `/path?demo=1`.
- **Header**, **Hero**, **How_It_Works**, **Fresh_Highlight**, **Example_Chips**, **Founding_Section**, **FAQ**, **Footer**: The eight sections of the Landing_Page, in that order.
- **Hobby_Input**: The text field in the Hero.
- **Path_Preview**: A static, non-interactive picture built from page markup (not a screenshot) of the bouldering sample path with done, current, locked and milestone nodes and Wick in the bouldering outfit.
- **Fresh_Preview**: A static, non-interactive picture built from page markup of the Fresh page.
- **Wick**: The mascot component `app/components/mascot/wick.vue`.
- **Wick_Logo**: The Wick logo image taken from existing assets in `public/logo` or `dev_docs`.
- **Token_Utilities**: Tailwind utilities backed by the `--pursio-*` theme variables, for example `bg-surface`, `text-ink`, `rounded-node`.
- **Dash_Character**: Any hyphen-minus, en dash or em dash character.
- **Visible_Copy**: Text a visitor can read or hear on the page, including alt text and ARIA labels.
- **PostHog_Client**: The existing PostHog client that `app/plugins/posthog.client.ts` provides as `$posthog` through the Nuxt app. The plugin runs in the browser only and provides `undefined` when the PostHog key or host is not configured.
- **Analytics_Wrapper**: A single `track(event, properties?)` function in `app/utils/analytics.ts` that all Landing_Page analytics calls go through and that sends each event to the PostHog_Client.
- **Legal_Pages**: The placeholder pages `/privacy`, `/terms` and `/refund`.
- **OG_Image**: The Open Graph image `public/og.png`, 1200 by 630 pixels, supplied by the owner.

## Requirements

### Requirement 1: Landing page at the root route

**User Story:** As a Visitor, I want to see the landing page at `/`, so that I understand what Pursio does before I start.

#### Acceptance Criteria

1. WHEN the Landing_Page is shown to a Visitor at `/`, THE Landing_Page SHALL render the eight sections in this order: Header, Hero, How_It_Works, Fresh_Highlight, Example_Chips, Founding_Section, FAQ, Footer.
2. WHEN the Path_Check ends with at least one Saved_Path and the URL of `/` has no query parameter `landing=1`, THE Landing_Page SHALL run the Existing_Redirect, for anonymous and signed in Visitors alike.
3. WHEN a Visitor opens `/?landing=1`, THE Landing_Page SHALL render the Landing_Page and SHALL NOT run the Existing_Redirect, whatever the number of Saved_Paths.
4. THE Landing_Page SHALL keep the Existing_Redirect logic inside `app/pages/index.vue`.
5. WHEN a Visitor without a Path_Hint opens `/`, THE server-rendered HTML of `/` SHALL contain the eight sections of the Landing_Page, and THE Landing_Page SHALL show the sections from first paint with no loading state before them.
6. WHEN the Path_Check ends with no Saved_Path, THE Landing_Page SHALL keep showing the Landing_Page, for anonymous and signed in Visitors alike.
7. WHEN a Visitor with a Path_Hint opens `/` without the query parameter `landing=1`, THE Landing_Page SHALL show the existing loading state instead of the sections from before first paint until the Path_Check ends.
8. WHEN the Path_Check ends with no Saved_Path for a Visitor whose Path_Hint was present, THE Landing_Page SHALL replace the loading state with the eight sections.
9. IF the Path_Check fails while the loading state is shown, THEN THE Landing_Page SHALL show the existing failure notice with "Try again" (`AuthRetryNotice`), as `/` does today.
10. IF the Path_Check fails while the sections are shown, THEN THE Landing_Page SHALL keep showing the sections.

### Requirement 2: Header

**User Story:** As a Visitor, I want a header with a way to try or start Pursio, so that I can act from the top of the page.

#### Acceptance Criteria

1. THE Header SHALL show the Wick_Logo and the text "Pursio" on the left.
2. THE Header SHALL show, on the right, a link "Try the demo" to `/path?demo=1` and a button "Build your path" that opens `/new`.
3. WHILE the viewport width is below 700 px, THE Header SHALL show only the Wick_Logo with "Pursio" and the "Build your path" button.
4. WHEN a Visitor activates "Try the demo", THE Landing_Page SHALL call the Analytics_Wrapper with the event `demo_clicked`.

### Requirement 3: Hero

**User Story:** As a Visitor, I want a clear headline and a hobby box, so that I can start in seconds.

#### Acceptance Criteria

1. THE Hero SHALL show the only h1 of the Landing_Page with the text "Type a hobby. Get a path."
2. THE Hero SHALL show the subline "Pursio turns any hobby into a clear path of small skills, with quests, XP and new videos picked for where you are."
3. THE Hero SHALL show the Hobby_Input with the placeholder "Bouldering, guitar, sourdough…", a visible or screen reader label, and a maximum length of 60 characters.
4. THE Hero SHALL show a button "Build my path" that submits the Hobby_Input.
5. WHEN a Visitor submits a Hobby_Input whose trimmed text is not empty, THE Landing_Page SHALL call the Analytics_Wrapper with the event `hero_hobby_submitted` and the property `length` set to the trimmed text length, and SHALL then perform the Hobby_Handoff with the trimmed text.
6. WHEN a Visitor submits a Hobby_Input whose trimmed text is empty, THE Landing_Page SHALL keep the Visitor on `/`, move focus to the Hobby_Input and show a short message "Type a hobby to start."
7. THE Hero SHALL show a link "See an example path" to `/path?demo=1`.
8. WHEN a Visitor activates "See an example path", THE Landing_Page SHALL call the Analytics_Wrapper with the event `demo_clicked`.
9. THE Hero SHALL show the Path_Preview beside the text on viewports of 700 px and wider, and below the text on narrower viewports.
10. THE Path_Preview SHALL show at least one done node, one current node, one locked node and one milestone node, and Wick in the bouldering outfit.
11. THE Landing_Page SHALL NOT send the hobby text to the Analytics_Wrapper for `hero_hobby_submitted`.

### Requirement 4: How it works

**User Story:** As a Visitor, I want to see how Pursio works in three steps, so that I know what I will do.

#### Acceptance Criteria

1. THE How_It_Works section SHALL show three steps with the titles "Type any hobby", "Do small quests" and "Watch what helps", each with one line of text as in the design.
2. THE How_It_Works section SHALL show a heading of level 2.

### Requirement 5: Fresh highlight

**User Story:** As a Visitor, I want a preview of the Fresh page, so that I see that new videos arrive for my skills.

#### Acceptance Criteria

1. THE Fresh_Highlight SHALL show the Fresh_Preview.
2. THE Fresh_Highlight SHALL show the text "New videos for your skills, every day. Checked for your level, sorted into your path."
3. THE Fresh_Preview SHALL contain no link, button or form control that can receive focus.
4. THE Fresh_Preview SHALL be hidden from screen readers, and THE Fresh_Highlight SHALL carry the same meaning in its text.

### Requirement 6: Example hobby chips

**User Story:** As a Visitor, I want example hobbies I can tap, so that I can start without typing.

#### Acceptance Criteria

1. THE Example_Chips SHALL show eight chips with the labels "bouldering", "guitar", "film photography", "sourdough", "chess", "gardening", "running" and "drawing", in that order.
2. WHEN a Visitor activates an example chip, THE Landing_Page SHALL call the Analytics_Wrapper with the event `example_hobby_clicked` and the property `hobby` set to the chip label, and SHALL then perform the Hobby_Handoff with the chip label.

### Requirement 7: Founding section anchor

**User Story:** As the owner, I want an empty anchor for a later waitlist, so that the page is ready for it without showing anything now.

#### Acceptance Criteria

1. THE Founding_Section SHALL be an element with `id="founding"` placed between the Example_Chips and the FAQ.
2. THE Founding_Section SHALL contain the comment `waitlist goes here` in its template source (Vue removes comments from the production HTML, so the comment is not required in the built page).
3. THE Founding_Section SHALL render no visible content, no focusable element and no heading.

### Requirement 8: FAQ

**User Story:** As a Visitor, I want answers to common questions, so that I can decide whether to try Pursio.

#### Acceptance Criteria

1. THE FAQ SHALL show four questions in this order: "Is it free?", "What hobbies work?", "Where do the videos come from?", "Do I need an account?"
2. THE FAQ SHALL show an answer for each question, readable without script interaction beyond opening and closing the item.
3. THE FAQ answer to "Where do the videos come from?" SHALL state that the videos come from YouTube, that Pursio picks and checks them, that they play from YouTube, and that nothing is copied.
4. THE FAQ answers to "Is it free?" and "Do I need an account?" SHALL state no price, plan name or amount of money.
5. THE FAQ answer to "What hobbies work?" SHALL state that any hobby, craft, sport or skill that a person can practice works.

### Requirement 9: Footer

**User Story:** As a Visitor, I want a footer with the key links, so that I can find the legal pages and the source code.

#### Acceptance Criteria

1. THE Footer SHALL show the Wick_Logo.
2. THE Footer SHALL show links "Privacy" to `/privacy`, "Terms" to `/terms` and "Refund" to `/refund`.
3. THE Footer SHALL show a link "Source code" to the Pursio public repository.
4. THE Footer SHALL show the text "Built for Kiroween 2026".

### Requirement 10: Placeholder legal pages

**User Story:** As a Visitor, I want the legal links to open real pages, so that no link in the footer is broken.

#### Acceptance Criteria

1. WHEN a Visitor opens `/privacy`, `/terms` or `/refund`, THE Legal_Pages SHALL render a page with one h1 naming the page, one short placeholder paragraph and a link back to `/`.
2. THE Legal_Pages SHALL use the same fonts, Token_Utilities and header and footer as the Landing_Page.
3. THE Legal_Pages SHALL state no price, no legal promise and no date of effect.

### Requirement 11: Hobby handoff on the new hobby page

**User Story:** As a Visitor arriving from the landing page, I want my hobby to be used right away, so that I do not have to type it again.

#### Acceptance Criteria

1. WHEN the New_Hobby_Page opens with the query parameter `hobby` whose trimmed value is not empty, THE New_Hobby_Page SHALL fill the hobby field with that value cut to 60 characters, set the start level to the existing beginner option `new` ("New to it", `DEFAULT_LEVEL` in `shared/utils/llm.ts`) and start path generation once.
2. WHEN the New_Hobby_Page opens without the query parameter `hobby`, or with an empty or blank value, THE New_Hobby_Page SHALL behave as it does today.
3. IF generation started by the query parameter ends in an error, THEN THE New_Hobby_Page SHALL show the existing error state and SHALL NOT start generation again until the learner submits.
4. THE New_Hobby_Page SHALL leave the existing hobby builder, level picker and error handling unchanged apart from reading the query parameter, setting the `new` level for that run and removing the query parameter.
5. WHEN the New_Hobby_Page starts path generation from the query parameter `hobby`, THE New_Hobby_Page SHALL at once remove `hobby` from the URL with `router.replace`, keeping any other query parameter and adding no history entry.
6. WHEN the Visitor refreshes the New_Hobby_Page or returns to the New_Hobby_Page with the back button after the query parameter `hobby` was removed, THE New_Hobby_Page SHALL behave as in Requirement 11.2 and start no generation.

### Requirement 12: Page metadata

**User Story:** As a Visitor sharing or finding the page, I want correct title and preview data, so that links look right.

#### Acceptance Criteria

1. THE Landing_Page SHALL set the page title to "Pursio · Type a hobby. Get a path."
2. THE Landing_Page SHALL set a meta description.
3. THE Landing_Page SHALL set the Open Graph tags `og:title`, `og:description`, `og:type`, `og:url` and `og:image`, and the `og:image` SHALL be the absolute URL of the OG_Image on `https://pursio.fun`.
4. THE Landing_Page SHALL set the canonical link to `https://pursio.fun/`.
5. THE OG_Image SHALL be a PNG of 1200 by 630 pixels that shows the headline "Type a hobby. Get a path.", the Wick_Logo and a path preview on the brand background.
6. THE Landing_Page SHALL set `og:image:width` to 1200 and `og:image:height` to 630.

### Requirement 13: Mobile fit and accessibility

**User Story:** As a Visitor on a phone, I want the page to fit and be easy to tap, so that I can use it one handed.

#### Acceptance Criteria

1. WHILE the viewport width is 390 px, THE Landing_Page SHALL cause no horizontal scrolling.
2. THE Landing_Page SHALL give every link, button, chip and input a tap target of at least 44 px by 44 px.
3. THE Landing_Page SHALL contain exactly one h1.
4. THE Landing_Page SHALL give every image element explicit width and height attributes.
5. THE Landing_Page SHALL show a visible focus outline on every focusable element, consistent with the existing pages.

### Requirement 14: Design system and copy rules

**User Story:** As the owner, I want the page to follow the existing design system and copy rules, so that it stays on brand and safe.

#### Acceptance Criteria

1. THE Landing_Page SHALL style all colors, radii and shadows with Token_Utilities, and SHALL contain no hardcoded color value, font family or shadow value in its components.
2. THE Landing_Page SHALL set headlines in Archivo Black and all other text in Archivo, through the existing font tokens.
3. THE Landing_Page SHALL render Wick with the existing Wick component and SHALL NOT add a second mascot implementation.
4. THE Landing_Page SHALL reuse existing components and assets where one fits.
5. THE Landing_Page SHALL contain no Dash_Character in Visible_Copy.
6. THE Landing_Page SHALL state no number of users, no review, no partner and no price.
7. THE Landing_Page SHALL NOT add a new dependency and SHALL NOT add a runtime config key.

### Requirement 15: Analytics wrapper

**User Story:** As the owner, I want landing events tracked through one function that sends them to PostHog, so that I can see how visitors use the page.

#### Acceptance Criteria

1. THE Analytics_Wrapper SHALL be a function `track(event, properties?)` in `app/utils/analytics.ts`, and every Landing_Page analytics call SHALL go through it.
2. WHEN the Analytics_Wrapper is called and the PostHog_Client is loaded, THE Analytics_Wrapper SHALL call `capture` on the PostHog_Client with the event name and the properties.
3. WHEN the Landing_Page is shown to a Visitor and stays shown (the Path_Check ends with no Saved_Path, the Path_Check fails while the sections are shown, or the URL has `landing=1`), THE Landing_Page SHALL call the Analytics_Wrapper once with the event `landing_viewed`.
4. WHEN the Existing_Redirect runs, THE Landing_Page SHALL NOT call the Analytics_Wrapper with `landing_viewed`.
5. WHEN a Visitor starts a tracked navigation (hero submit, example chip, demo link), THE Landing_Page SHALL perform the navigation whether or not the Analytics_Wrapper sent the event.
6. IF the PostHog_Client is not loaded when the Analytics_Wrapper is called, THEN THE Analytics_Wrapper SHALL return without sending the event, without logging and without throwing.
7. IF the `capture` call of the PostHog_Client throws, THEN THE Analytics_Wrapper SHALL catch the error and return without logging and without throwing.

## Assumptions

Each item is the smallest assumption made where the request is silent. Please confirm or correct.

1. **Who sees the landing.** Resolved by owner decision, 2026-11-18: the rule depends on Saved_Paths, not on sign in. A Visitor with no Saved_Path, anonymous or signed in, sees the Landing_Page. A Visitor with at least one Saved_Path runs the Existing_Redirect. `/?landing=1` always shows the Landing_Page. `landing_viewed` fires only when the Landing_Page is shown (Requirements 1.2, 1.3, 1.6, 15.3, 15.4).
2. **Loading state.** Owner decision, 2026-11-18: a first-time Visitor gets the landing content in the server-rendered HTML with no loader first. Only a Visitor with a Path_Hint gets the existing loading state, then the redirect (Requirements 1.5, 1.7). See Assumption 22 for how this works without the server reading Saved_Paths.
3. **"Build your path" button** opens `/new` with no hobby and is not tracked.
4. **Empty hobby submit** shows the message "Type a hobby to start." and stays on `/` (Requirement 3.6).
5. **Hobby cap of 60 characters** matches the existing `maxlength` on `/new`.
6. **`demo_clicked`** is sent for both demo links with no properties.
7. **Analytics wrapper.** Owner decision, 2026-11-18: PostHog is live. No `track()` exists in `app/` today; `useHobbyBuilder` and `useCloudStore` call `$posthog?.capture(...)` directly. The wrapper is added in `app/utils/analytics.ts` and calls `capture` on the PostHog_Client that `app/plugins/posthog.client.ts` provides as `$posthog`. When the PostHog_Client is `undefined` (key or host not set, or during server rendering) or `capture` throws, the wrapper does nothing and stays silent (Requirements 15.2, 15.6, 15.7). The existing direct `$posthog` calls elsewhere are not changed.
8. **FAQ wording for "Is it free?"** (to be confirmed): "You can build a path and work through it without paying anything right now." No price is stated.
9. **FAQ wording for "Do I need an account?"** (to be confirmed): "You can start without signing up. Add an account later to keep your paths on any device."
10. **FAQ wording for "What hobbies work?"** (to be confirmed): "Anything you can practice and get better at: a sport, a craft, an instrument or a skill. Type yours and Pursio builds the path."
11. **FAQ wording for the videos** (to be confirmed): "The videos come from YouTube. Pursio picks them and checks them for your level. They play from YouTube, and nothing is copied."
12. **FAQ opens and closes** with native disclosure markup; no script is needed.
13. **Logo asset.** No file named for Wick exists in `public/logo`. The Wick_Logo is the existing app icon from `public/logo` (for example `App icon 1024-192.png`) next to the text "Pursio"; the exact file is chosen in design.
14. **Source code link** goes to `https://github.com/gorkemtumkaya/pursio`. Confirmed by the owner, 2026-11-18.
15. **Legal page text** is one placeholder sentence per page, for example "This page is a placeholder and will be filled in before launch." No legal content is invented.
16. **OG_Image.** Owner decision, 2026-11-18: the owner supplies the static file `public/og.png`. The requirements reference the file (Requirement 12); the project does not generate it, at build time or at request time. Requirement 12.5 describes the file the owner supplies.
17. **Fresh_Preview and Path_Preview** are built from markup and sample data in the app (for example the existing `fresh-samples.ts` and the bouldering sample), not from images.
18. **Meta and Open Graph copy.** The description is "Pursio turns any hobby into a clear path of small skills, with quests, XP and new videos picked for where you are." and `og:type` is `website`.
19. **Dash rule for the title.** The page title uses the middle dot from the request, which is not a Dash_Character.
20. **Theme.** The page uses the default theme tokens like every other page; no landing-specific theme is added.
21. **Hobby query is removed from the URL.** Owner decision, 2026-11-18, replacing the earlier assumption that the hobby stays in the URL: `/new?hobby=<hobby>` starts generation once at the `new` level and then removes `hobby` with `router.replace`, so a refresh or the back button does not build again (Requirements 11.1, 11.5, 11.6). The level picker is not shown during generation, so the Visitor does not see the level choice for this run.
22. **How the server knows whether to show the landing** (to be confirmed). Saved_Paths are Path_Rows in Supabase (spec: accounts-cloud-save). The Cloud_Store loads them in the browser after the session starts, and the Supabase session lives in localStorage, so the server cannot read them. No cookie is used by the app today. The smallest mechanism, with no new dependency: the server always renders the Landing_Page, and a Head_Script (like the existing theme script in `nuxt.config.ts`) reads the Path_Hint from localStorage before first paint and marks the page so the loading state shows instead of the sections. The Path_Check then decides: redirect, or show the sections. Trade-offs:
    - A returning Visitor whose Path_Hint is missing (for example, localStorage was cleared but the session survived, or the Active_Hobby was forgotten) sees the landing briefly, then the redirect once the Path_Check ends.
    - A Visitor with a stale Path_Hint (the path was deleted on another device) sees the loader briefly, then the landing.
    - The rejected alternative is a small cookie hint (`1` when Saved_Paths exist) that the server reads. It avoids the flash for the server render but adds a cookie that every page that adds or removes a path must keep in sync, and it still needs the Path_Check to confirm.
23. **Path_Check failure** (to be confirmed). A Visitor who sees the loader because of a Path_Hint gets the existing "Try again" notice when the Path_Check fails, as `/` does today. A Visitor who already sees the sections keeps them, so a network problem never hides the landing from a first-time Visitor (Requirements 1.9, 1.10).
24. **Archived paths count as Saved_Paths** (to be confirmed). A Visitor whose paths are all archived runs the Existing_Redirect, which opens the New_Hobby_Page as it does today, because archived paths are never picked as the last active path.
