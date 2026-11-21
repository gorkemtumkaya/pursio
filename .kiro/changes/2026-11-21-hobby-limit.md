# Changes: Free plan hobby limit

On 2026-11-21 the owner asked for a limit of 3 active hobbies on the free plan, a card on the new hobby page at the limit, two analytics events, and the copy that mentions it. There is no spec folder; the request is the requirement.

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Size:** 26 files changed, 6 added, in 5 groups

## Review order

1. G1, the rule: one pure function everything else calls.
2. G2, the server check: the part that enforces it.
3. G3, the page.
4. G4, copy.

## Groups

### G1. The limit rule

[shared/utils/hobby-limit.ts](../../shared/utils/hobby-limit.ts): `hobbyLimitBlocks({ hobbies, requested, unlimited })`. Counted hobbies are those not archived and not the demo path. An unlimited account is never blocked; below 3 nothing is blocked; at or above 3 only a rebuild of a counted hobby goes through (so an account with more than 3 keeps them and cannot add). A rebuild is recognised by comparing the normalized request with each counted hobby's Hobby_Id and typed hobby.

| File | Why it changed |
|---|---|
| [shared/utils/hobby-limit.ts](../../shared/utils/hobby-limit.ts) | New: `FREE_HOBBY_LIMIT = 3`, `countedHobbies`, `isRebuild`, `hobbyLimitBlocks` |
| [tests/property/hobby-limit.property.test.ts](../../tests/property/hobby-limit.property.test.ts) | Counts only active, non demo hobbies; archived and demo hobbies never change the answer; archiving frees a slot; a founder, a rebuild and an account below the limit are never blocked |

- **Watch for:** building an archived hobby again counts as a new hobby, because the save restores it.

### G2. Enforced in the tree route

`POST /api/tree` checks the limit after the token and the input, and before the cache, the rate limit and any model call. Over the limit answers 403 `hobby_limit`. Paid status comes from the billing mirror on the server; nothing in the request is read for it.

| File | Why it changed |
|---|---|
| [server/utils/llm-handlers.ts](../../server/utils/llm-handlers.ts) | Step 1d, new dep `hobbyLimitBlocks`, `ERROR_STATUS.hobby_limit = 403`, stage `limit_check` |
| [server/utils/llm-runtime.ts](../../server/utils/llm-runtime.ts) | `treeHobbyLimitBlocks`: reads the paths; reads paid status only when the paths alone would block |
| [server/utils/supabase-server.ts](../../server/utils/supabase-server.ts) | `listHobbiesForUser`: Hobby_Id, typed hobby and `archived` with the user's token (RLS) |
| [server/utils/billing-handlers.ts](../../server/utils/billing-handlers.ts), [billing-runtime.ts](../../server/utils/billing-runtime.ts) | `accountHasPaidAccess`, `paidAccessForToken` |
| [shared/types/llm.ts](../../shared/types/llm.ts), [shared/utils/llm.ts](../../shared/utils/llm.ts), [app/utils/tree-client.ts](../../app/utils/tree-client.ts) | New error code `hobby_limit` |
| [tests/unit/tree-route.test.ts](../../tests/unit/tree-route.test.ts), [tests/support/tree-deps.ts](../../tests/support/tree-deps.ts) | `hobby_limit` makes 0 model calls and touches no cache, rate limit or save; a failed or slow check also makes 0 model calls |

- **Related, not changed:** [server/api/intake.post.ts](../../server/api/intake.post.ts). The intake route is not limited on the server; the page skips it at the limit.
- **Watch for:**
  - A check that cannot be decided (a read fails or takes over 8 seconds) answers 502 `generation_failed` and builds nothing, so the limit cannot be skipped by an outage.
  - The Hobby_Id of a saved path comes from the generated tree, which is not known before the model call. A rebuild that the model names differently is saved as a new hobby, so an account at the limit can end up with one more. Not handled.

### G3. The new hobby page

At the limit the page shows `HobbyLimitCard` in place of the form. The page checks before intake and before the tree request; the server's `hobby_limit` answer leads to the same card.

| File | Why it changed |
|---|---|
| [app/components/hobby/HobbyLimitCard.vue](../../app/components/hobby/HobbyLimitCard.vue), [app/utils/hobby-limit-copy.ts](../../app/utils/hobby-limit-copy.ts) | New card: heading, text, "Become a founding member", "Manage my hobbies"; only the archive option when founding spots are gone or checkout is off |
| [app/composables/useHobbyBuilder.ts](../../app/composables/useHobbyBuilder.ts) | State `limit`, `limitReached`, `activeHobbyCount`, checks in `start()` and `generate()` |
| [app/pages/new.vue](../../app/pages/new.vue) | Shows the card; sends `hobby_limit_shown` |
| [app/composables/useFoundingCheckout.ts](../../app/composables/useFoundingCheckout.ts), [app/components/landing/LandingFounding.vue](../../app/components/landing/LandingFounding.vue) | The founding checkout moved out of the landing card into a composable, unchanged, so the limit card opens the same checkout |
| [app/utils/analytics.ts](../../app/utils/analytics.ts) | `hobby_limit_shown`, `hobby_limit_checkout_clicked` |

- **Watch for:**
  - The page only blocks when it knows the plan: a guest, or a signed-in account whose billing status loaded. Otherwise it lets the server decide.
  - With the card in place of the form, a rebuild at the limit is only reachable through a `?hobby=` link; nothing in the app links to one for an existing hobby.
  - "Manage my hobbies" goes to the last active path, whose hobby list has Archive.

### G4. Copy

| File | Why it changed |
|---|---|
| [app/utils/landing-copy.ts](../../app/utils/landing-copy.ts) | Founding card's first check is "Unlimited hobbies, today"; FAQ "Is Pursio free?" as written by the owner |
| [app/utils/pricing-tiers.ts](../../app/utils/pricing-tiers.ts) | Free: "3 active hobbies"; Plus: "Unlimited hobbies"; the Plus line "Support an independent, open-source app" removed (asked 2026-11-21) |
| [app/utils/legal-copy.ts](../../app/utils/legal-copy.ts) | Terms, "Free app, Plus and founding membership": the limit of 3 active hobbies |
| [CHANGELOG.md](../../CHANGELOG.md) | One line under Unreleased |

### G5. Pricing page: founding tier, badge on yearly only (asked 2026-11-21, same batch)

| File | Why it changed |
|---|---|
| [app/utils/pricing-tiers.ts](../../app/utils/pricing-tiers.ts) | Third tier "Founding member" with `oneTimePriceId` and the note "First 50 only"; `paidPriceIds` includes it, so one PricePreview call prices all three |
| [app/components/pricing/PricingTierCard.vue](../../app/components/pricing/PricingTierCard.vue) | One-time tier: price with "once", the founding button and its sold-out and member states; "MOST POPULAR" only when Yearly is selected |
| [app/components/pricing/PricingView.vue](../../app/components/pricing/PricingView.vue) | Uses `useFoundingCheckout` for the founding tier |
| [app/utils/pricing-copy.ts](../../app/utils/pricing-copy.ts), [tests/unit/paddle-pricing.test.ts](../../tests/unit/paddle-pricing.test.ts) | Texts; the expected price ID list |

- **Watch for:** the Plus card keeps its highlighted border on Monthly; only the badge follows the toggle.

## Decisions

1. **Plus is unlimited too.** Decided 2026-11-21 by the owner: yes.
2. **The founder badge stays on the founding card.** Decided 2026-11-21 by the owner. The card's checks are "Unlimited hobbies, today", "Founder badge and the Founding Wick outfit", lifetime Plus and the vote.
3. **Heading for an account above the limit** shows its own number ("You have 5 hobbies going.").

## Not changed on purpose

- **`LEGAL_UPDATED`** already reads 21 November 2026, today's date.
- **The Terms' list of founding perks** still names the badge and the outfit.

## Verification

- **Run:** `yarn vitest run`: 145 files passed, 1 skipped; 1394 tests passed, 16 skipped. `yarn typecheck`: no errors. Headless browser on the dev server: `/new` shows the form for a guest with no hobbies, the landing card and `/pricing` show the new lines, no page errors.
- **Not run:** the limit card in a browser (it needs an account with 3 hobbies); the route against Supabase; the founding checkout from the card.

## Manual checks before release

- [ ] With 3 active hobbies as a free account, open `/new`: the card shows, no request goes to `/api/intake`.
- [ ] Archive one hobby and open `/new` again: the form is back.
- [ ] As a founding member with 3 or more hobbies: the form shows and a new hobby builds.
