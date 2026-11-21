# Changes: Paddle integration (pricing, checkout and fulfillment)

On 2026-11-21 the owner asked, through three Paddle prompts in one session, for a sandbox catalog, a pricing page with Paddle Checkout, and a server-side fulfillment layer: verified webhooks, a subscription mirror with an access rule, and the Paddle customer portal. The work was done on a `paddle` branch in a separate worktree, then merged into `main`. There is no spec folder; the prompts are the requirements.

This summary was written after the work was committed, not while it was done, so it is put together from the session and the diff.

- **Repos and branches:** `pursio` `paddle` (deleted after the merge), merged into `main`
- **State:** committed in `68b9d7f` (feature, v0.7.0 by the release hook) and merged into `main` in `eddc9e7`. Local tag `v0.7.0` is on `eddc9e7`; nothing is pushed.
- **Size:** 30 files in the feature commit: 8 changed, 22 added, in 5 groups. The merge commit also changed [supabase/README.md](../../supabase/README.md).

## Paddle sandbox entities (outside the repo)

These are part of the running system. Don't delete them or clean them up.

| Entity | ID | Notes |
|---|---|---|
| Product Premium | `pro_01m7yxc6q85jyxdnpnbd2k1wc9` | Tax category `saas` |
| Price, monthly | `pri_01m7yxc793p1af7c9vnmqcmw3n` | USD 4.99 (`"499"`), 7-day trial, card required |
| Price, yearly | `pri_01m7yxc7ekh0c4wb7xc24w7q69` | USD 29.99 (`"2999"`), 7-day trial, card required |
| Client-side token | `ctkn_01m7yy0twdx8m8n79yatdtk0qm` | Public token for Paddle.js (`test_…`) |
| Default payment link | `https://pursio.fun/pricing` | Account checkout setting |
| Notification destination | `ntfset_01m7z171r97eyx18hk6hxm7hfq` | `https://pursio.fun/api/paddle/webhook`, traffic `all`; the six events below |
| Test subscriptions | `sub_01m7z0f0kkzj3w4sdt1c6k36sr`, `sub_01m7z2cfxn3k2nkjhqj1sj1mc2` | From the e2e checkouts, customer `e2e-test@example.com`; the second is mirrored |

Account settings were read and left unchanged: card, PayPal, Apple Pay and Bancontact on; tax mode `location`; balance currency USD; all automatic currency conversions off.

## Review order

1. G3, the mirror schema: everything server-side writes to it.
2. G4, webhooks: the only writer.
3. G5, status, portal and Settings: readers of the mirror.
4. G1 and G2: the client-side pricing page and checkout, which depend on nothing above.

## Groups

### G1. Pricing page with localized prices

Paddle.js `PricePreview()` fetches monthly and yearly totals in one call. The page shows Paddle's `formattedTotals` as they are, with no price math or reformatting. The country comes from `x-vercel-ip-country` during server rendering. Without the header, no address is sent and Paddle locates the visitor by IP.

| File | Why it changed |
|---|---|
| [app/utils/pricing-tiers.ts:10](../../app/utils/pricing-tiers.ts#L10) | The editable `Tier` list (Free, Premium) with the sandbox price IDs; `null` price means a free tier with no checkout |
| [app/utils/paddle-pricing.ts:16](../../app/utils/paddle-pricing.ts#L16) | Header to country; `OTHERS` stays app-side and is never sent to Paddle ([pricePreviewParams:22](../../app/utils/paddle-pricing.ts#L22)); maps the response to formatted totals and trial days |
| [app/pages/pricing.vue:12](../../app/pages/pricing.vue#L12) | Reads the header on the server and passes it through `useState` |
| [app/components/pricing/PricingView.vue:24](../../app/components/pricing/PricingView.vue#L24) | Loads prices on mount and holds the frequency toggle state |
| [app/components/pricing/PricingTierCard.vue](../../app/components/pricing/PricingTierCard.vue), [PricingFrequencyToggle.vue](../../app/components/pricing/PricingFrequencyToggle.vue) | One card per tier; monthly/yearly as native radios |
| [app/utils/pricing-copy.ts](../../app/utils/pricing-copy.ts) | Page and welcome text |
| [tests/unit/paddle-pricing.test.ts](../../tests/unit/paddle-pricing.test.ts) | Country sentinel never sent, totals kept as-is, config rules |

- **Watch for:** the owner chose two tiers (Free and Premium) instead of three. Premium's feature list is placeholder text.

### G2. Checkout and environment safety

`Paddle.Checkout.open` uses `displayMode: 'overlay'` and `variant: 'one-page'`, and redirects to `/welcome`. It prefills a signed-in account's email and puts `pursioUserId` in custom data. The environment and token come from env vars with no default.

| File | Why it changed |
|---|---|
| [app/utils/paddle-config.ts:21](../../app/utils/paddle-config.ts#L21) | Throws when `NUXT_PUBLIC_PADDLE_ENV` is unset or unknown, or when the token prefix (`test_` / `live_`) does not match; messages never include the token |
| [app/composables/usePaddle.ts](../../app/composables/usePaddle.ts) | One Paddle.js instance per page load, client-only |
| [app/components/pricing/PricingView.vue:39](../../app/components/pricing/PricingView.vue#L39) | `subscribe()`: checkout settings, email prefill, `pursioUserId` |
| [app/pages/welcome.vue](../../app/pages/welcome.vue) | Success page |
| [nuxt.config.ts:25](../../nuxt.config.ts#L25), [nuxt.config.ts:102](../../nuxt.config.ts#L102) | Public `paddleEnv` and `paddleClientToken`, with a startup warning when either is unset |
| [package.json](../../package.json), [yarn.lock](../../yarn.lock) | `@paddle/paddle-js` 1.6.6, pinned |

- **Related, not changed:** [app/composables/useAuth.ts](../../app/composables/useAuth.ts) supplies `email` (signed-in only) and `userId`.
- **Watch for:** the price IDs are sandbox-only. With `NUXT_PUBLIC_PADDLE_ENV=production`, the previews fail until the live IDs are put in `pricing-tiers.ts`.

### G3. Mirror schema in Supabase

There are three tables, `customers`, `subscriptions` and `transactions`, following the repo's server-only conventions (as for `waitlist`): RLS on with no policy, and no grants to `anon` or `authenticated`. Writes go through three `security definer` functions that only `service_role` can execute. Each upsert is keyed on the Paddle ID and only moves a row forward (`paddle_updated_at`), so out-of-order and repeated deliveries are safe. A `pursioUserId` that names no user is stored as null instead of failing the foreign key.

| File | Why it changed |
|---|---|
| [supabase/migrations/20261121000100_paddle_billing.sql:13](../../supabase/migrations/20261121000100_paddle_billing.sql#L13) | Tables, indexes, RLS; [functions from line 76](../../supabase/migrations/20261121000100_paddle_billing.sql#L76); rollback at the end |
| [supabase/README.md](../../supabase/README.md) | Migration 14 and where the service role key is used. The merge commit put `path_profile` (13) and `paddle_billing` (14) in apply order |

- **Watch for:** `status` has no check constraint on purpose, so a status Paddle adds later is stored instead of failing every delivery; unknown statuses grant no access.

### G4. Webhook handler

`POST /api/paddle/webhook` reads the raw body and verifies it with `paddle.webhooks.unmarshal(rawBody, secret, signature)` before anything else, using the destination's signing secret, not the API key. A missing signature or body gets 400, a failed check 401, missing config or a failed write 500; a 2xx is sent only for an event that verified and was processed or deliberately ignored. It handles `subscription.created/updated/canceled`, `customer.created/updated` and `transaction.completed`, and acknowledges all other types without writing. A subscription or transaction that arrives before its customer gets the customer from the Paddle API first.

| File | Why it changed |
|---|---|
| [server/api/paddle/webhook.post.ts](../../server/api/paddle/webhook.post.ts) | Thin route: `readRawBody`, `paddle-signature` header |
| [server/utils/billing-handlers.ts:200](../../server/utils/billing-handlers.ts#L200) | `handlePaddleWebhook`: verify, then [processEvent:174](../../server/utils/billing-handlers.ts#L174); [withCustomer:159](../../server/utils/billing-handlers.ts#L159) handles a customer that hasn't arrived yet |
| [server/utils/billing-handlers.ts:146](../../server/utils/billing-handlers.ts#L146) | `failureReason`: a fixed label such as `fetch_customer:no_api_key` in the log and the 500 body. It is only returned after the signature verifies, so only Paddle sees it |
| [server/utils/billing-runtime.ts:21](../../server/utils/billing-runtime.ts#L21) | Server environment with no default; rejects an API key from the other environment (`pdl_sdbx_apikey_` / `pdl_live_apikey_`) |
| [server/utils/billing-runtime.ts:108](../../server/utils/billing-runtime.ts#L108) | Supabase store over the RPCs; Postgres code `23503` means "customer missing" |
| [nuxt.config.ts:92](../../nuxt.config.ts#L92) | Server-only `paddleApiKey` and `paddleWebhookSecret` |
| [nuxt.config.ts:43](../../nuxt.config.ts#L43) | Dev server only: allows ngrok hosts so sandbox webhooks can reach `yarn dev` |
| [tests/unit/paddle-billing.test.ts](../../tests/unit/paddle-billing.test.ts) | Real SDK `unmarshal` with self-signed bodies: wrong secret, changed body, old timestamp, re-serialized body; redelivery, out-of-order events, unknown types, failed writes |
| [package.json](../../package.json) | `@paddle/paddle-node-sdk` 3.12.0, pinned |

- **Watch for:** Paddle's SDK rejects a signature timestamp more than 5 seconds off, so the server clock must be correct.

### G5. Access rule, billing status, portal and Settings

[shared/utils/billing-access.ts:16](../../shared/utils/billing-access.ts#L16): `active`, `trialing` and `past_due` grant access, and so does a scheduled cancel or pause, until the status itself changes. `paused`, `canceled` and unknown statuses don't. `GET /api/billing/status` and `POST /api/billing/portal` both authenticate first, from the Authorization header only. The portal finds the Paddle customer only through the account's confirmed email: `pursioUserId` is supplied by the client, so it may grant access but never chooses whose portal opens. The portal route returns only the URL.

| File | Why it changed |
|---|---|
| [shared/utils/billing-access.ts](../../shared/utils/billing-access.ts) | `grantsPaidAccess` and `currentSubscription` |
| [shared/types/billing.ts](../../shared/types/billing.ts) | Mirror row and response types |
| [server/utils/billing-handlers.ts:283](../../server/utils/billing-handlers.ts#L283) | `handleBillingStatus`; [handleBillingPortal:319](../../server/utils/billing-handlers.ts#L319) |
| [server/utils/billing-runtime.ts:233](../../server/utils/billing-runtime.ts#L233) | `verifyUser`: email only when confirmed and not anonymous; `customerPortalSessions.create` |
| [server/api/billing/status.get.ts](../../server/api/billing/status.get.ts), [portal.post.ts](../../server/api/billing/portal.post.ts) | Routes; `cache-control: no-store`; the body is ignored |
| [app/components/billing/BillingSettings.vue](../../app/components/billing/BillingSettings.vue), [app/utils/billing-copy.ts](../../app/utils/billing-copy.ts) | Plan state and "Manage subscription", which gets a fresh portal URL each time |
| [app/pages/settings.vue:318](../../app/pages/settings.vue#L318) | New Subscription group between Account and App |
| [tests/unit/conventions.test.ts](../../tests/unit/conventions.test.ts), [tests/unit/fresh-config-smoke.test.ts](../../tests/unit/fresh-config-smoke.test.ts) | Allowed dependency list and service-role-key files updated (billing-runtime.ts added) |
| [CHANGELOG.md](../../CHANGELOG.md) | Three lines, released as 0.7.0 by the pre-commit hook |

- **Related, not changed:** [server/utils/account-runtime.ts](../../server/utils/account-runtime.ts) (same service-role pattern); [shared/utils/auth.ts](../../shared/utils/auth.ts) (`parseBearer`).
- **Watch for:** a buyer who checked out as a guest gets access through `pursioUserId` but can't open the portal until they sign in with the email used at checkout. Settings tells them so.

## Decisions

1. **Tiers.** Decided 2026-11-21 by the owner: Free and Premium only (two cards), since the catalog has one paid plan.
2. **Regional prices.** Decided 2026-11-21 by the owner: no overrides; Paddle auto-converts. Later the same day: keep USD only (conversions stay off).
3. **Tax category `saas`, trial requires a card.** Chosen by the agent at catalog setup and reported; not changed by the owner.
4. **`past_due` grants access.** Chosen by the agent following Paddle's recommendation (grace while Paddle retries). To be confirmed by the owner.
5. **Portal customer by verified email only.** Chosen by the agent: custom data comes from the client, and a checkout with someone else's email could otherwise open their portal.
6. **Merge commit without a second release.** The merge was committed with `SKIP_RELEASE=1`, so the version stays 0.7.0; the post-commit hook moved the local tag to the merge.

## Not changed on purpose

- **`.env.example`:** not edited. The agent's permission settings block every env file. The owner adds the Paddle keys.
- **Account settings:** no payment-method, tax or currency setting was changed.
- **Landing page:** no link to `/pricing`, and the founding copy ("nobody buys here") is unchanged.
- **Backfill:** no backfill script. `sub_01m7z0f0kkzj3w4sdt1c6k36sr` was created before the destination existed and isn't mirrored until Paddle sends its next event.
- **Transactions:** no `processed_webhooks` ledger. Every handler only upserts, so it isn't needed.

## Verification

- **Run:** `yarn vitest run` on the merged `main`: 144 files passed, 1 skipped; 1367 tests passed, 16 skipped. `yarn typecheck`: no errors.
- **Run, sandbox end to end:**
  - A headless checkout on `/pricing`, through the overlay with test card 4242, redirected to `/welcome`.
  - Real `subscription.created` and `transaction.completed` deliveries reached `yarn dev` through ngrok. Once `NUXT_PADDLE_API_KEY` was set they answered 200; before that, `fetch_customer:no_api_key`.
  - `GET /api/billing/status` then showed `trialing` with access for the anonymous buyer.
  - The portal answered 401 without auth, and 404 for a guest even when the body named the customer ID.
  - A bad signature was answered with 401.
- **Not run:**
  - The portal success path: it needs a signed-in account with a confirmed email.
  - A real scheduled cancel: blocked by the agent's permission settings. It is covered only by unit tests.
  - The SQL functions against a local Postgres: Docker was not running. They ran in the owner's Supabase through the real deliveries.

## Manual checks before release

- [ ] Sign in with a real email, check out on `/pricing` with the same email, then Settings, Subscription, "Manage subscription": the Paddle portal opens.
- [ ] In the portal, cancel at the end of the period: Settings shows "Cancels on …" and access stays.
- [ ] After deploying, the notification log for `ntfset_01m7z171r97eyx18hk6hxm7hfq` shows 200 from `pursio.fun`.
- [ ] Decide whether production should show the sandbox `/pricing` before going live.

## Follow-ups

- Add the Paddle keys to `.env.example` and Vercel: `NUXT_PUBLIC_PADDLE_ENV`, `NUXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NUXT_PADDLE_API_KEY`, `NUXT_PADDLE_WEBHOOK_SECRET`.
- Apply the billing migration to the production database.
- Replace Premium's placeholder features.
- Going live: a live catalog and its price IDs, a live client token and API key, a live notification destination, and domain approval.
- Optional: a backfill script, and gating Premium features on `grantsPaidAccess`.
