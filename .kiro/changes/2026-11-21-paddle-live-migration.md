# Changes: Paddle live migration (catalog and price IDs)

On 2026-11-21 the owner connected the `paddle-live` MCP and asked to continue the live migration. Earlier batches: [2026-11-21-paddle-integration.md](2026-11-21-paddle-integration.md), [2026-11-21-paddle-go-live.md](2026-11-21-paddle-go-live.md) (committed in `c325430` and `b496425`).

- **Repos and branches:** `pursio` `main`
- **State:** G1 committed by the owner in `ced27ea`; G2 uncommitted
- **Size:** G2: 5 files changed, in 2 groups overall

## Live Paddle entities (outside the repo)

Permanent. Never delete, archive or recreate them.

| Entity | Sandbox ID | Live ID | Notes |
|---|---|---|---|
| Product Plus | `pro_01m7yxc6q85jyxdnpnbd2k1wc9` | `pro_01m7ywxhgq82670exfb88hyymp` | Existed in live as "Premium" with no prices; renamed in place. Tax category `standard` in live, `saas` in sandbox (not changed, see Decisions) |
| Price Plus monthly, USD 4.99, 7-day trial | `pri_01m7yxc793p1af7c9vnmqcmw3n` | `pri_01m7z6481j4bcy66nv7yfax61s` | New |
| Price Plus yearly, USD 29.99, 7-day trial | `pri_01m7yxc7ekh0c4wb7xc24w7q69` | `pri_01m7z6488p39zfejmazaz0f408` | New |
| Product Founding member | `pro_01m7z53bqpv547tfxdvnfhj9e4` | `pro_01m7z648hw83fz0s35fp05qr8j` | New, tax category `standard` like the live Plus product |
| Price Founding one-time, USD 19.99, quantity 1 | `pri_01m7z53bx7exmc85qm2cfkssbt` | `pri_01m7z648r3tja83w8z89kry3bx` | New |

| Client-side token | `ctkn_01m7yy0twdx8m8n79yatdtk0qm` | `ctkn_01m7z712zw08g2jhesebzkxvpg` | New, public `live_…` token for Paddle.js |
| Notification destination | `ntfset_01m7z171r97eyx18hk6hxm7hfq` | `ntfset_01m7z719wac60qpe8ydt739kwp` | New, `https://pursio.fun/api/paddle/webhook`, platform traffic, the same six events. Never recreate it: that rotates the signing secret |
| Default payment link | `https://pursio.fun/pricing` | `https://pursio.fun/pricing` | Set in live after `pursio.fun` was approved |

Read and left unchanged in live: payment methods (card, PayPal, Apple Pay, Bancontact: the same as sandbox), tax mode `location`, balance currency USD, currency conversions off. Live has no API key yet. `pursio.fun` is approved in live.

**Host:** the site serves from `pursio.fun`; `www.pursio.fun` redirects to it (the owner changed this on 2026-11-21, after the go-live summary recorded the opposite). Paddle does not follow redirects for webhooks, so the sandbox destination and payment link were pointed back at `pursio.fun`.

## Groups

### G1. Price IDs per Paddle environment

Production still runs on sandbox while Paddle reviews the site, so the sandbox IDs could not simply be replaced. Each environment now has its own set, chosen by `NUXT_PUBLIC_PADDLE_ENV`.

| File | Why it changed |
|---|---|
| [app/utils/pricing-tiers.ts](../../app/utils/pricing-tiers.ts) | `PRICE_IDS` and `FOUNDING_PRICE_ID` per environment; `tiersFor(environment)` replaces the fixed `TIERS` |
| [app/components/pricing/PricingView.vue](../../app/components/pricing/PricingView.vue) | Picks the tiers for the configured environment |
| [tests/unit/paddle-pricing.test.ts](../../tests/unit/paddle-pricing.test.ts) | Both sets are valid IDs and share none |

- **Watch for:** `FOUNDING_PRICE_ID` is not used by any code yet; it records the mapping for the founding checkout.

### G2. Founding card sells instead of collecting emails (asked 2026-11-21)

The owner no longer wants the waitlist on the founding card. "Become a founding member" now opens Paddle Checkout for the one-time founding price of the configured environment. A guest gets the sign-in dialog first (`save` mode, which keeps their anonymous paths), so every purchase carries a Pursio account in `pursioUserId`.

| File | Why it changed |
|---|---|
| [app/components/landing/LandingFounding.vue](../../app/components/landing/LandingFounding.vue) | Button instead of the waitlist form; overlay one-page checkout, `/welcome?founding=1`; disabled "Opening soon" while `NUXT_PUBLIC_PADDLE_CHECKOUT_ENABLED` is off |
| [app/utils/landing-copy.ts](../../app/utils/landing-copy.ts) | Button and small print as the owner first wrote them; the FAQ no longer says Plus is not open |
| [app/pages/welcome.vue](../../app/pages/welcome.vue), [app/utils/pricing-copy.ts](../../app/utils/pricing-copy.ts) | A founding version of the welcome text |
| [app/utils/legal-copy.ts](../../app/utils/legal-copy.ts) | Terms: the "join the waitlist while spots are not open" line removed |

- **Related, not changed:** [LandingWaitlistForm.vue](../../app/components/landing/LandingWaitlistForm.vue) still has its `founding` style and `POST /api/waitlist` still accepts `kind: 'founding'`; the "follow along" card uses the form.
- **Watch for:**
  - **Nothing fulfils a founding purchase yet.** The webhook stores the transaction with the account id, but no code grants lifetime Plus, the badge or the Wick outfit, and `grantsPaidAccess` looks at subscriptions only. The `transactions` table does not store which product was bought.
  - **The limit of 50 is not enforced**, neither by Paddle nor by the app.
  - After signing in, the buyer has to press the button again.
  - People already on the founding waitlist are not told that spots are open.

## Decisions

1. **Tax category of the live products.** Open. Live "Premium" was `standard`; the sandbox products are `saas`. Options: keep `standard`, or change both live products to `saas` (it must be enabled for the live account, and cannot change after a sale). Recommended: `saas`, since Pursio is a web app, if Paddle allows it on the account.

## Not changed on purpose

- **Production env vars:** still sandbox, with checkout off, until verification passes.
- **Sandbox:** nothing modified. Its Plus product description and price descriptions still say "Premium".

## Verification

- **Run:** `yarn vitest run`: 144 files passed, 1 skipped; 1374 tests passed, 16 skipped. `yarn typecheck`: no errors. Live catalog read back after creation.
- **Not run:** a live price preview in the browser (no live client token); any live checkout (not verified).

## Follow-ups

- Owner: live API key (dashboard), payout bank details, account verification.
- At the switch to live: set `NUXT_PUBLIC_PADDLE_ENV=production`, the live client token, the live API key and the live destination's signing secret in production; turn checkout on after a test payment.
