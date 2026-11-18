# Changes: Landing page

A landing page at `/` for visitors without a saved path, three placeholder legal pages, and a hobby handoff into `/new`. Reasoning is in [requirements.md](requirements.md) and [design.md](design.md); the tasks are in [tasks.md](tasks.md).

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted. Do not stage `CHANGELOG.md` until you want the release: the pre-commit hook releases it.
- **Size:** 12 files changed, 28 added, in 10 groups
- **Design:** the sections follow the mockup in [dev_docs/Landing page · Desktop-html](../../../dev_docs/Landing%20page%20%C2%B7%20Desktop-html/Landing.dc.html) (owner, 2026-11-18). Where it differs from `requirements.md`, the mockup wins; the differences are listed under Decisions, 6.

## Review order

1. G2 Landing logic and copy: every rule of the page is here, and the other groups call it.
2. G3 Path_Hint and Head_Script: decides what a returning visitor sees before the app loads.
3. G5 Index wiring: joins G2 and G3 and keeps the redirect. The riskiest file.
4. G7 New-page handoff: the only change to an existing flow.
5. G8 Waitlist: a new public route that stores email addresses. Read the handler with its tests, and apply the migration.
6. G1 Analytics wrapper, G4 Sections, G6 Legal pages: small or visual.

## Groups

### G1. Analytics wrapper (Req 15.1, 15.2, 15.5 to 15.7)

One `track()` function that sends to PostHog and stays silent when PostHog is missing or throws.

| File | Why it changed |
|---|---|
| [app/utils/analytics.ts](../../../app/utils/analytics.ts) | New. `sendEvent` (the testable core) and `track`, which finds `$posthog` with `tryUseNuxtApp` and never throws, so a click always navigates |

- **Related, not changed:** [app/plugins/posthog.client.ts](../../../app/plugins/posthog.client.ts) (provides `$posthog`, or nothing when the key is unset); [app/composables/useHobbyBuilder.ts](../../../app/composables/useHobbyBuilder.ts) and [app/composables/useCloudStore.ts](../../../app/composables/useCloudStore.ts) (their direct `$posthog?.capture` calls stay as they are).
- **Watch for:** `track` is called from click handlers, outside setup. If an event is missing in PostHog, `tryUseNuxtApp` returned nothing there (design, Risk 4).

### G2. Landing logic and copy (Req 1, 3.5, 3.6, 6.2, 8, 11.1, 11.2, 11.5, 14.5, 14.6)

| File | Why it changed |
|---|---|
| [app/utils/landing.ts](../../../app/utils/landing.ts) | New. `pathCheckOf` and `decideLanding` (the decision table for `/`), `normalizeHobby`, `landingHandoffUrl`, `parseHobbyQuery`, `withoutHobbyQuery`, and the constants `NEW_PAGE`, `DEMO_PATH`, `SITE_URL` |
| [app/utils/landing-copy.ts](../../../app/utils/landing-copy.ts) | New. Every visible text of the landing and legal pages, the eight example hobbies, the four FAQ items and the Fresh sample rows |

- **Watch for:** `pathCheckOf` counts archived paths, so an account with only archived paths is redirected (to `/new`, since it has no active path).

### G3. Path_Hint and Head_Script (Req 1.3, 1.5, 1.7)

The server cannot see saved paths. A script in `<head>` marks `<html data-path-hint>` when the device has stored a hobby, and CSS then shows the loader instead of the landing before first paint.

| File | Why it changed |
|---|---|
| [shared/utils/path-hint.ts](../../../shared/utils/path-hint.ts) | New. `hasPathHint` and the hand-written `pathHintInitScript` with the same rule; the storage keys are literals because `nuxt.config.ts` cannot import from `app/` |
| [nuxt.config.ts:50-52](../../../nuxt.config.ts#L50-L52) | Adds the script to `<head>` after the theme script |
| [app/assets/css/main.css:78](../../../app/assets/css/main.css#L78) | The `path-hint:` variant, used as `hidden path-hint:block` and `path-hint:hidden` |

- **Related, not changed:** [app/utils/active-hobby.ts](../../../app/utils/active-hobby.ts) and [app/utils/hobby-store.ts](../../../app/utils/hobby-store.ts) own the two storage keys that `PATH_HINT_KEYS` repeats.
- **Watch for:** no test guards the two copies of the rule or the repeated keys yet (tasks 2.4 and 2.5 are open). A renamed storage key would silently bring back the flash of the landing before the redirect.

### G4. Sections (design mockup; Req 3, 7, 8, 9, 13)

Built to the mockup's values (sizes, radii, spacing, copy) with the theme tokens, so all three themes work. Wide values start at 700 px; the header links show from 900 px.

| File | Why it changed |
|---|---|
| [LandingView.vue](../../../app/components/landing/LandingView.vue) | New. Header, Hero, How it works, Meet Wick, Founding members, FAQ, Footer; sends no analytics because it also renders in the `pending` shell |
| [LandingHeader.vue](../../../app/components/landing/LandingHeader.vue) | New. The logo (the theme's `--pursio-logo`, the same file as `public/logo/Favicon 64.svg`) and "Pursio", links to `#how`, `#wick`, `#founding` and `#faq`, "Open the app" to `/new`. The links keep the query on `/`, so `/?landing=1` does not fall into the redirect |
| [LandingHero.vue](../../../app/components/landing/LandingHero.vue) | New. Badge, the only `h1`, the hobby card (input, "Build my path", four "Try:" chips that fill the input) and the note; sends the length of the hobby, never the text |
| [LandingPathPreview.vue](../../../app/components/landing/LandingPathPreview.vue) | New. Static, `aria-hidden` path card: banner, four nodes at the mockup's positions, trail dots, speech bubble and Wick |
| [LandingHowItWorks.vue](../../../app/components/landing/LandingHowItWorks.vue) | New. Eyebrow, heading and three numbered cards |
| [LandingWick.vue](../../../app/components/landing/LandingWick.vue) | New. "Meet Wick" banner with Wick in three outfits |
| [LandingFounding.vue](../../../app/components/landing/LandingFounding.vue) | New. The offer card (badge, price, perks) and the "follow along" card, each with an email form (see G8) |
| [LandingFaq.vue](../../../app/components/landing/LandingFaq.vue) | New. Native `details` items; one open at a time, the first open at the start |
| [LandingFooter.vue](../../../app/components/landing/LandingFooter.vue) | New. "© 2026 Pursio", source code link and the three legal links |

- **Related, not changed:** [app/components/mascot/wick.vue](../../../app/components/mascot/wick.vue) takes its size in px, so the two sections render one copy per width and CSS shows one.
- **Watch for:** two shadows use `shadow-[0_Npx_0_var(--pursio-…)]` with a token variable, because the mockup's 4, 5 and 8 px depths have no shadow token. No color is hardcoded.

### G5. Index wiring (Req 1, 12, 15.3, 15.4)

| File | Why it changed |
|---|---|
| [app/pages/index.vue](../../../app/pages/index.vue) | Rewritten. Computes the Path_Hint and the view, renders loader plus landing while pending, keeps the redirect with the same target but triggered by the view, sends `landing_viewed` once, sets title, canonical link and Open Graph tags |

- **Related, not changed:** [app/components/auth/SessionGate.vue](../../../app/components/auth/SessionGate.vue) (`AuthSessionGate`) is no longer used on this page (the server must render the sections, and a failed session must not hide them); `/new`, `/path`, `/quests` and `/profile` still use it.
- **Watch for:** the `pending` and `landing` branches each render `LandingView`, so it is created again once when the check finishes. If text typed in the hero during the check is lost or the page jumps, share one `LandingView` with a bound class (design, `index.vue` outline).
- **Watch for:** `og:image` points to `https://pursio.fun/og.png`, which does not exist in `public/` yet.

### G6. Legal pages (Req 10)

| File | Why it changed |
|---|---|
| [app/utils/legal-copy.ts](../../../app/utils/legal-copy.ts) | New. The text of the three pages, the "last updated" date and the contact address |
| [LegalPage.vue](../../../app/components/landing/LegalPage.vue) | New. Header, one `h1`, the date, the sections of a document, "Back to Pursio", footer; sets the page title |
| [privacy.vue](../../../app/pages/privacy.vue), [terms.vue](../../../app/pages/terms.vue), [refund.vue](../../../app/pages/refund.vue) | New. Each renders `LegalPage` with its document |

- **Related, not changed:** the privacy text was written from [app/plugins/posthog.client.ts](../../../app/plugins/posthog.client.ts), [app/composables/useAuth.ts](../../../app/composables/useAuth.ts) (anonymous, Google and email sign in; sends the email to PostHog), [server/utils/ai-observability.ts](../../../server/utils/ai-observability.ts) (sends AI input and output to PostHog), [app/utils/youtube-iframe.ts](../../../app/utils/youtube-iframe.ts) and the migrations.
- **Watch for:** the pages now state facts, a price promise (30-day refund) and a date, which Req 10.3 ruled out for the placeholders. The owner asked for filled pages on 2026-11-18. No lawyer has read them.
- **Watch for:** when the app starts to collect or send something new, `legal-copy.ts` must change with it.

### G7. New-page handoff (Req 11)

| File | Why it changed |
|---|---|
| [app/pages/new.vue](../../../app/pages/new.vue) | The header shows the logo (`--pursio-logo`) in place of the star circle, like the sidebar and the landing header (owner, 2026-11-18) |
| [app/pages/new.vue:107-130](../../../app/pages/new.vue#L107-L130) | A one-shot `watchEffect`: `?hobby=` starts one build at the default level once a session is ready, then `hobby` is removed from the URL so refresh and back start nothing |

- **Watch for:** `build()` must read the hobby and level before its first `await`, because `router.replace` runs right after it. A failed build is not retried.

### G8. Waitlist (founding section; decision 7)

Both cards of the founding section store an email address. Nobody pays on the page.

| File | Why it changed |
|---|---|
| [supabase/migrations/20261118000000_waitlist.sql](../../../supabase/migrations/20261118000000_waitlist.sql) | New. Table `waitlist` (`email` as key, `kind`, `created_at`); Row Level Security on with no policy, so only the service role can read or write it |
| [shared/utils/waitlist.ts](../../../shared/utils/waitlist.ts) | New. The two kinds (`founding`, `updates`), the error codes and `parseWaitlistEmail`, used by the form and the server |
| [server/utils/waitlist-handlers.ts](../../../server/utils/waitlist-handlers.ts) | New. `handleWaitlist`: checks kind and address, limits by IP, saves with a timeout; the same answer for a new and a known address |
| [server/utils/waitlist-runtime.ts](../../../server/utils/waitlist-runtime.ts) | New. The Supabase write with the service role key and the limiter (5 per IP per hour) |
| [server/api/waitlist.post.ts](../../../server/api/waitlist.post.ts) | New. The public route `POST /api/waitlist` |
| [LandingWaitlistForm.vue](../../../app/components/landing/LandingWaitlistForm.vue) | New. The email form; shows "You're on the list" only after the server stored the address |
| [app/utils/analytics.ts](../../../app/utils/analytics.ts) | New event `waitlist_joined` with the kind, never the address |
| [supabase/README.md](../../../supabase/README.md) | Migration step 12 |
| [tests/unit/waitlist.test.ts](../../../tests/unit/waitlist.test.ts) | New. 17 cases for the email rule and the handler |
| [tests/unit/conventions.test.ts:339](../../../tests/unit/conventions.test.ts#L339) | The guard that lists the files allowed to name the service role key now includes `waitlist-runtime.ts` |

- **Related, not changed:** [server/utils/rate-limiter.ts](../../../server/utils/rate-limiter.ts) (in memory per server instance, the known limit of APP-SEC-01 in `KNOWN_BUGS.md`); [server/utils/account-runtime.ts](../../../server/utils/account-runtime.ts) (the pattern the runtime follows).
- **Watch for:** apply the migration before release. Without the table every sign-up answers "Could not save that. Try again."
- **Watch for:** the route is public and has no captcha. The IP limit slows a script but does not stop one that changes address or lands on many server instances. Addresses are not confirmed by email.
- **Watch for:** a founding sign-up replaces an earlier `updates` row for the same address (and resets `created_at`); an `updates` sign-up never changes a `founding` row.
- **Watch for:** the page now stores personal data (email addresses). The Privacy page says so (G6).

### G9. Dependency tests (not part of the landing page)

Three tests failed since commit `3b19d5c`, which added PostHog with loose versions. Fixed on the owner's request, 2026-11-18.

| File | Why it changed |
|---|---|
| [package.json](../../../package.json) | `posthog-js`, `posthog-node` and `@types/node` pinned to the installed versions (1.451.0, 6.0.3, 26.6.6), as the project rule asks |
| [yarn.lock](../../../yarn.lock) | The three entry keys renamed to the exact versions; the resolved packages are the same |
| [tests/unit/conventions.test.ts:328](../../../tests/unit/conventions.test.ts#L328), [tests/unit/fresh-config-smoke.test.ts:42](../../../tests/unit/fresh-config-smoke.test.ts#L42) | The known dependency lists now include the two PostHog packages and `@types/node` |

- **Watch for:** nothing was upgraded or installed; `yarn install --frozen-lockfile` accepts the lockfile.

### G10. Wick v2 (not part of the landing page spec)

The owner asked for the mascot to follow the new drawings in `dev_docs/wick-v2/Wick` (2026-11-18): 8 moods, 7 hobby outfits and a founding outfit. Every drawing is the same body with a face and an accessory, so a script takes them apart and the component puts any mood and any outfit together.

| File | Why it changed |
|---|---|
| [scripts/build-wick-art.mjs](../../../scripts/build-wick-art.mjs) | New. Reads the 16 drawings, drops the shared body, keeps one face per mood and one accessory per outfit, and turns theme colors into CSS variables. Run it again when the drawings change |
| [app/utils/wick-art.ts](../../../app/utils/wick-art.ts) | New, generated. The face, accessory and spark fragments |
| [app/components/mascot/wick.vue](../../../app/components/mascot/wick.vue) | Rewritten on the v2 body (300 by 360, same proportions and the same props). Draws the body, the mood's face and the outfit's accessory |
| [app/utils/wick.ts](../../../app/utils/wick.ts) | Moods `happy`, `proud`, `encourage`, `focus` and `surprised`; outfit `founding`; the boulder palette now holds the v2 colors, and each palette has the extra stops the new gradients need |
| [app/pages/dev/wick.vue](../../../app/pages/dev/wick.vue) | New, dev only. A sheet of every mood and outfit in every theme |

- **Related, not changed:** the pages that show Wick ([new.vue](../../../app/pages/new.vue), the path, profile, quests and Fresh components) pass the same props as before.
- **Watch for:** what the v2 drawings do not have is gone: the arms, the glow around Wick, the flickering flame tip, the "z" letters of the sleep mood and the bat of the halloween theme.
- **Watch for:** with no outfit, Wick in the boulder theme is now bare; before, it wore the bouldering outfit.
- **Watch for:** the drawings exist in the boulder colors only. The trail and halloween flame colors and their hats (kept from the first Wick, scaled up) are my adaptation, not a design.
- **Watch for:** `cheer` keeps its jump and uses the happy face. The `founding` outfit exists but nothing shows it yet.
- **Watch for:** the fragments are inserted with `v-html`. They are fixed strings from the generated file, never user input.

## Decisions

All decided by the owner on 2026-11-18.

1. **What decides the redirect at `/`?** Saved paths, not sign in. A visitor with at least one saved path is redirected; `/?landing=1` always shows the landing.
2. **What does the server render?** Always the landing. The Head_Script hides it behind the loader on a device with a Path_Hint.
3. **Analytics.** PostHog is live; the four landing events go through `track()`.
4. **The `hobby` query.** Removed from the URL after it starts a path.
5. **`og.png`.** Supplied by the owner; no task creates it.
6. **The mockup decides the look and the copy.** The owner pointed to the HTML mockup after the first build, which followed `requirements.md` and looked different. Differences from the requirements that follow from it:
   - Sections: "Meet Wick" is new; the Fresh highlight (Req 5) and the separate chips section (Req 6) are gone. Four chips sit in the hero and fill the input instead of starting a path (Req 6.1, 6.2).
   - Header: section links and "Open the app" replace "Try the demo" and "Build your path" (Req 2). The hero has no "See an example path" link (Req 3.7, 3.8), so `demo_clicked` is never sent.
   - Copy: headline, lead, steps and FAQ use the mockup's text. Wick is animated in the hero (the requirement asked for a still one).
   - Footer: "© 2026 Pursio" replaces the logo and the Kiroween line (Req 9).
7. **Founding section: a waitlist, not a sale.** Decided 2026-11-18: the section is built as in the mockup, but visitors join a waitlist instead of becoming founding members directly. The "Become a founding member" button is replaced by an email field and "Join the founding waitlist". The note under it and the FAQ answer about founding members say that no payment is taken and that spots are not open yet. Price, perks and the refund line stay as in the mockup. Storing the addresses in Supabase and the table's shape are my choices; the owner asked for a waitlist, not for a place to keep it.
8. **Footer.** The owner commented out the "Source code" link on 2026-11-18. "Contact" opens an email to `hello@pursio.fun`, the address the owner gave on 2026-11-18.

## Not changed on purpose

- `requirements.md`, `design.md` and `tasks.md` still describe the first build. A note at the top of `requirements.md` points here; the documents are not rewritten.
- `DEMO_PATH` in `landing.ts` and the `demo_clicked` event in `analytics.ts` are unused now and left in place.
- The footer keeps Terms and Refund next to Privacy, although the mockup shows only Privacy: the pages exist and need a way in.
- The optional test tasks (1.4 to 1.12, 2.4, 2.5, 5.4) are not written. They are marked optional in `tasks.md` and stay unchecked.
- The existing direct PostHog calls in `useHobbyBuilder` and `useCloudStore` were not moved to `track()`.
- `.env.example` and `KNOWN_BUGS.md` also show as modified in the working tree. Those edits are not part of this batch.

## Verification

- **Run:** `yarn typecheck`: no errors.
- **Run:** `yarn test`: 1240 passed, 16 skipped, none failed (the 3 dependency tests that failed before are fixed in G9).
- **Run:** `curl` against the running dev server: `/`, `/?landing=1`, `/privacy`, `/terms` and `/refund` return 200. The HTML of `/` has the title, the canonical link, the description, the seven Open Graph tags, one `h1`, the `#founding` section, the Head_Script, and both the hidden loader and the landing.
- **Run:** headless Chrome screenshots of `/?landing=1` at 1440 px and 390 px in the boulder theme, compared by eye with the two mockup images: header, hero, path card, steps, Wick banner, founding section, FAQ and footer match in layout and copy, apart from the items in decisions 7 and 8.
- **Run:** `POST /api/waitlist` on the dev server with a bad address: 400 `invalid_email`.
- **Not run:** apart from the waitlist tests, no test covers the new code (see "Not changed on purpose"). No sign-up was saved for real: the `waitlist` table does not exist until the migration is applied. Wick v2 was compared by eye on `/dev/wick` with a sheet of the 16 design files, in all three themes, with motion off. Not checked in a browser: Wick's animations, the redirect, the loader before first paint, analytics events, keyboard use, and the trail and halloween themes. The project has no lint script.

## Manual checks before release

The full matrix is in [design.md](design.md), "Testing Strategy". The checks that nothing automated covers:

- [ ] New device (empty localStorage): `/` shows the sections from first paint.
- [ ] Device with saved paths, anonymous and signed in: loader from first paint, then the redirect, no flash of sections.
- [ ] `/?landing=1` with saved paths: sections, no loader, no redirect.
- [ ] Account with no paths but a stale Path_Hint: loader, then the sections; `landing_viewed` once.
- [ ] Account with only archived paths: redirect to `/new`.
- [ ] Offline with a Path_Hint: "Try again" notice. Offline without one: the sections stay.
- [ ] PostHog shows `landing_viewed`, `hero_hobby_submitted` (with `length` only) and `example_hobby_clicked`; no `landing_viewed` on a redirect.
- [ ] PostHog key unset: every click still navigates and the console stays clean.
- [ ] Header at 899 px and 900 px; no horizontal scroll at 390 px; the page in the trail and halloween themes.
- [ ] Hero submit with empty text, spaces and a hobby; a chip click fills the input; the header links scroll to their sections, also from a legal page.
- [ ] `/new?hobby=guitar&x=1` starts one build at "New to it"; the URL becomes `/new?x=1`; refresh and back start nothing.
- [ ] Keyboard focus outline on every control.
- [ ] After the migration: join the founding waitlist and the updates list; each shows its confirmation and a row appears in `waitlist`. A bad address shows the message and saves nothing.
- [ ] Wick on `/new`, the path, the unlock card, the profile and Fresh: size, position and motion (float, blink, the cheer jump) look right with the new drawing.
- [ ] `/privacy`, `/terms` and `/refund` render and link back.
- [ ] `public/og.png` exists and is 1200 by 630; a share preview shows it with the title.

## Follow-ups

- Apply `20261118000000_waitlist.sql` to Supabase, then join both lists once and check the rows.
- Have the three policy pages checked, and add what they leave out: who runs Pursio (name and country), the law that applies, a minimum age, and where the services keep data.
- Bring `requirements.md`, `design.md` and `tasks.md` in line with the mockup (decision 6).
- Add `public/og.png` (owner).
- Write the optional tests, first 2.4 and 2.5 (Head_Script against `hasPathHint`, and the storage keys) and 1.4 (the decision table).
