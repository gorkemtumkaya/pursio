# Changes: Paddle go-live preparation

On 2026-11-21 the owner asked to take the tested sandbox integration live, in three parts: migrate the catalog and config to live, audit readiness, then hand over to `vendors.paddle.com`. The `paddle-live` MCP is not connected in this session, so every live-account step is waiting on the owner. This batch covers what can be done without it. Earlier work: [2026-11-21-paddle-integration.md](2026-11-21-paddle-integration.md).

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Size:** 18 files changed, 2 added, in 6 groups

## Review order

1. G1: the webhook allowlist is a security change on the payment path.
2. G2: Retain.
3. G3: the sandbox settings fix, outside the repo.

## Groups

### G1. Only Paddle's IPs may deliver webhooks

The list comes from Paddle's `/ips` endpoint (`data.ipv4_cidrs`) for the configured environment: `api.paddle.com` for live, `sandbox-api.paddle.com` for sandbox. It is never hard-coded. It is cached for an hour, and a failed refresh keeps the last good list. With no list at all the route answers 503, so Paddle retries. A source outside the list gets 403 before the signature is checked.

| File | Why it changed |
|---|---|
| [server/utils/paddle-ips.ts](../../server/utils/paddle-ips.ts) | New: CIDR matching, response parsing, source address from `x-real-ip` and `x-forwarded-for` (both set by Vercel), cached fetcher |
| [server/utils/billing-handlers.ts](../../server/utils/billing-handlers.ts) | `handlePaddleWebhook` checks the source first; new deps `allowedCidrs` and `ipAllowed` |
| [server/utils/billing-runtime.ts](../../server/utils/billing-runtime.ts) | Fetches the list for the validated environment; `BillingConfig.environment` |
| [server/api/paddle/webhook.post.ts](../../server/api/paddle/webhook.post.ts) | Passes the source address |
| [tests/unit/paddle-billing.test.ts](../../tests/unit/paddle-billing.test.ts) | 403 for unlisted sources (even when correctly signed), 503 without a list, CIDR and header parsing, caching |

- **Watch for:** local testing now works only through a tunnel that forwards the real source address (ngrok sets `x-forwarded-for`). A direct `curl localhost` gets 403. The source headers are trusted because Vercel overwrites them; behind another proxy, check that it does the same.

### G2. Paddle Retain: `pwCustomer`

`GET /api/billing/status` now returns `customerId`, the Paddle customer found from the account's verified email. A client plugin passes it to Paddle.js as `pwCustomer`, on Initialize, or with Update when Paddle.js is already loaded. Paddle.js now loads on every page for signed-in accounts that have a Paddle customer; guests and accounts that never bought load nothing.

| File | Why it changed |
|---|---|
| [app/plugins/paddle-retain.client.ts](../../app/plugins/paddle-retain.client.ts) | New: one status request per page load for signed-in accounts; failures are ignored |
| [app/composables/usePaddle.ts](../../app/composables/usePaddle.ts) | `pwCustomer` on Initialize, `setCustomer` with Update |
| [shared/types/billing.ts](../../shared/types/billing.ts), [server/utils/billing-handlers.ts](../../server/utils/billing-handlers.ts) | `customerId` in the status response |

- **Watch for:** logging out and in as another account in the same page load keeps the first customer in Paddle.js until the page reloads.

### G3. Sandbox settings use the real host (outside the repo)

`pursio.fun` answers with a 308 redirect to `www.pursio.fun`, and Paddle does not follow redirects for webhooks. The sandbox destination `ntfset_01m7z171r97eyx18hk6hxm7hfq` now points at `https://www.pursio.fun/api/paddle/webhook`, and the sandbox default payment link at `https://www.pursio.fun/pricing`.

### G4. Checkout switch (asked 2026-11-21)

Production can show `/pricing` while Paddle reviews the live account, without anyone being able to check out. `NUXT_PUBLIC_PADDLE_CHECKOUT_ENABLED` is off unless it is exactly `true`. While it is off, prices still come from Paddle, Subscribe becomes a disabled "Coming soon", and a note says Premium opens soon.

| File | Why it changed |
|---|---|
| [nuxt.config.ts](../../nuxt.config.ts) | Public `paddleCheckoutEnabled`, default `false` |
| [app/utils/paddle-config.ts](../../app/utils/paddle-config.ts) | `checkoutEnabled`: only `true` / `"true"` turn it on |
| [app/components/pricing/PricingView.vue](../../app/components/pricing/PricingView.vue), [PricingTierCard.vue](../../app/components/pricing/PricingTierCard.vue) | "Coming soon" button and note; `subscribe` does nothing while off |
| [app/utils/pricing-copy.ts](../../app/utils/pricing-copy.ts) | Button and note text |
| [tests/unit/paddle-pricing.test.ts](../../tests/unit/paddle-pricing.test.ts) | The switch's values |

### G5. Draft text for Premium and Paddle (asked 2026-11-21, needs owner review)

The legal pages and the landing page described a one-time $19 founding membership that is "not on sale". They now describe Premium as it is in the Paddle catalog, with Paddle as merchant of record. Not reviewed by a lawyer.

| File | Why it changed |
|---|---|
| [app/utils/legal-copy.ts](../../app/utils/legal-copy.ts) | Terms: Premium price, Paddle's standard merchant-of-record wording, trial, renewal, cancellation, failed payments, price changes. Refund: trial, cancel anytime, 30-day refund per payment (kept from the earlier promise), how to ask (email or paddle.net). Privacy: what Paddle receives, what Pursio gets back from Paddle, purchase records kept for tax law. Date: 21 November 2026 |
| [app/utils/landing-copy.ts](../../app/utils/landing-copy.ts) | Founding section becomes "Pursio Premium · opening soon" ($4.99/month or $29.99/year, 7-day trial), still with the waitlist form; nav label "Premium"; FAQ answers for Premium and refunds |
| [app/components/landing/LandingFounding.vue](../../app/components/landing/LandingFounding.vue) | "See plans and prices" link to `/pricing` |
| [app/utils/pricing-tiers.ts](../../app/utils/pricing-tiers.ts) | Premium features made to match the landing perks |

- **Watch for:**
  - The Premium perks are placeholders. Nothing is locked behind Premium yet, and a reviewer may ask what Premium includes.
  - The waitlist still stores `kind: 'founding'`; only the text changed.
  - The landing prices are fixed text and must be updated by hand if the catalog changes.

### G6. Founding offer back as the main landing card; the plan is named Plus (asked 2026-11-21)

This replaces the landing part of G5. The left card is the founding member offer again: $19.99 once for the first 50, with lifetime Plus. The owner renamed the paid plan from Premium to Plus, so every user-facing "Premium" in the app is now "Plus".

| File | Why it changed |
|---|---|
| [app/utils/landing-copy.ts](../../app/utils/landing-copy.ts) | Founding badge, headline, price, the line under the price, three perks, button label and small print as the owner wrote them; nav label back to "Founding members"; FAQ renamed to Plus |
| [app/components/landing/LandingFounding.vue](../../app/components/landing/LandingFounding.vue) | The "Plus will be $29.99 a year" line moved to its own line under the price |
| [app/utils/legal-copy.ts](../../app/utils/legal-copy.ts), [pricing-copy.ts](../../app/utils/pricing-copy.ts), [billing-copy.ts](../../app/utils/billing-copy.ts), [pricing-tiers.ts](../../app/utils/pricing-tiers.ts) | Premium renamed to Plus |
| [tests/unit/paddle-pricing.test.ts](../../tests/unit/paddle-pricing.test.ts) | Tier name in the fixture |

- **Watch for:**
  - "Become a founding member" still submits the waitlist form (owner decision): no `founding-checkout` spec exists and Paddle has no one-time founding product yet.
  - The price is $19.99, from the owner's later answer; the first request said $19.
  - The Terms, Refund and FAQ text still describe only the Plus subscription (monthly, yearly, trial), not the one-time founding purchase. The owner asked for no other changes.
  - The Paddle sandbox product is still named Premium, and released CHANGELOG entries keep the old name.

## Not changed on purpose

- **Environment switching:** the code has no `Paddle.Environment.set('sandbox')` or `sandbox-api.paddle.com`. Both SDKs pick the host from `NUXT_PUBLIC_PADDLE_ENV`, so switching to live means changing env vars only.
- **Price IDs** in [app/utils/pricing-tiers.ts](../../app/utils/pricing-tiers.ts): waiting for the live catalog.
- **Legal pages and the landing founding offer:** content decisions for the owner (see the readiness audit in chat).

## Verification

- **Run:** `yarn vitest run`: 144 files passed, 1 skipped; 1372 tests passed, 16 skipped. `yarn typecheck`: no errors. `curl` of `api.paddle.com/ips` and `sandbox-api.paddle.com/ips`: six /32s each.
- **Not run:**
  - A real delivery through the allowlist, since the code isn't deployed.
  - Retain, which needs a live account with Retain on.

## Follow-ups

- Once `paddle-live` is connected: recreate Premium and both prices in live, swap the price IDs, create a live client token, create a live destination on `https://www.pursio.fun/api/paddle/webhook`, and set the default payment link.
