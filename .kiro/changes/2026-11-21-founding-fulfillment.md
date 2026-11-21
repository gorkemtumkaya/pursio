# Changes: Founding fulfillment and the limit of 50

On 2026-11-21 the owner asked to build what a founding purchase grants (lifetime Plus, the founder badge, the Founding Wick outfit) and the "first 50 only" limit. The founding button was already selling in live (`b675d4a`) with neither. Earlier batches: [2026-11-21-paddle-live-migration.md](2026-11-21-paddle-live-migration.md).

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Size:** 14 files changed, 5 added, in 4 groups

## Review order

1. G1, the table: everything else reads or writes it.
2. G2, the webhook: the only writer.
3. G3, the limit.
4. G4, what a member sees.

## Groups

### G1. `founding_members` table

One row per completed founding transaction. `refunded_at` ends the membership. Same server-only rules as the billing mirror: RLS on with no policy, one `security definer` function for the write, executable by `service_role` only.

| File | Why it changed |
|---|---|
| [supabase/migrations/20261121000200_founding_members.sql](../../supabase/migrations/20261121000200_founding_members.sql) | Table, indexes, `paddle_record_founding_member` (idempotent; never clears a refund or unlinks an account) |
| [supabase/README.md](../../supabase/README.md) | Migration 15 and its rollout order |
| [shared/utils/paddle-catalog.ts](../../shared/utils/paddle-catalog.ts) | New home of `FOUNDING_PRICE_ID` (the server needs it too), `FOUNDING_LIMIT = 50`, `isFoundingPrice` |
| [app/utils/pricing-tiers.ts](../../app/utils/pricing-tiers.ts) | Re-exports the price ID from shared |

- **Watch for:** apply the migration before deploying. Without the table, `GET /api/billing/status` answers 502 for every account.

### G2. Webhook: a founding purchase makes a member, a refund ends it

`transaction.completed` with the founding price of the server's environment records the member (account from `pursioUserId`, customer from Paddle). `adjustment.created` / `adjustment.updated` with action `refund` or `chargeback` and status `approved` sets `refunded_at`.

| File | Why it changed |
|---|---|
| [server/utils/billing-handlers.ts](../../server/utils/billing-handlers.ts) | `fulfilFounding`, `revokeFoundingOnRefund`, four new `BillingStore` methods, `WebhookDeps.environment` |
| [server/utils/billing-runtime.ts](../../server/utils/billing-runtime.ts) | Supabase implementation of the four methods |
| [tests/unit/paddle-billing.test.ts](../../tests/unit/paddle-billing.test.ts) | Real SDK parsing of transaction and adjustment events: fulfilment, idempotency, other prices, refund, chargeback, pending refund, credits |

- **Outside the repo:** both notification destinations (sandbox `ntfset_01m7z171r97eyx18hk6hxm7hfq`, live `ntfset_01m7z719wac60qpe8ydt739kwp`) now also subscribe to `adjustment.created` and `adjustment.updated`. Updated in place; the signing secrets are unchanged.
- **Watch for:** any approved refund on the founding transaction ends the membership, a partial one too.

### G3. The limit of 50

`GET /api/founding/availability` answers `{ available }`: fewer than 50 memberships sold and not refunded. The landing card asks on load and again right before it opens checkout, and shows "All 50 founding spots are taken" instead of the button.

| File | Why it changed |
|---|---|
| [server/api/founding/availability.get.ts](../../server/api/founding/availability.get.ts) | New public route; shared caches may keep the answer 30 seconds |
| [server/utils/billing-handlers.ts](../../server/utils/billing-handlers.ts) | `handleFoundingAvailability` |
| [app/components/landing/LandingFounding.vue](../../app/components/landing/LandingFounding.vue) | Availability check, sold-out state, "You're a founding member" state |

- **Watch for:** this is a soft limit. Paddle has no stock limit, so two buyers who check out within the same moments for the last spot can both pay, and someone could open the checkout without the button. Such a purchase is recorded and honored, and the webhook logs `founding_over_limit`.

### G4. What a member gets in the app

| File | Why it changed |
|---|---|
| [shared/types/billing.ts](../../shared/types/billing.ts), [server/utils/billing-handlers.ts](../../server/utils/billing-handlers.ts) | Status response has `founding`; `access` is true for a member with or without a subscription |
| [app/composables/useBillingStatus.ts](../../app/composables/useBillingStatus.ts) | New: one shared status request per page load for a signed-in account |
| [app/pages/profile.vue](../../app/pages/profile.vue), [app/components/ProfileHero.vue](../../app/components/ProfileHero.vue) | Wick wears the `founding` outfit on the profile; a "FOUNDING MEMBER" badge under the name |
| [app/utils/billing-copy.ts](../../app/utils/billing-copy.ts) | Settings row: "Founding member · Plus for life" |
| [app/utils/landing-copy.ts](../../app/utils/landing-copy.ts), [CHANGELOG.md](../../CHANGELOG.md) | New card texts; two lines under Unreleased |

- **Related, not changed:** [app/components/billing/BillingSettings.vue](../../app/components/billing/BillingSettings.vue) and [app/plugins/paddle-retain.client.ts](../../app/plugins/paddle-retain.client.ts) still make their own status request.

## Decisions

1. **Where the founding outfit shows.** Chosen by the agent: on the profile only, where it replaces the hobby outfit. Wick on the path pages keeps the hobby outfit. To be confirmed by the owner.
2. **Purchases beyond 50.** Chosen by the agent: honor and log, never refund automatically. To be confirmed by the owner.
3. **The vote on hobbies and features** (third perk) has no feature in the app; nothing was built for it.

## Not changed on purpose

- **Nothing in the app is locked behind Plus yet**, so "lifetime Plus" is the `access` flag only.
- **No backfill script.** The one existing live founding purchase is fulfilled by replaying its notification (see Follow-ups).

## Verification

- **Run:** `yarn vitest run`: 144 files passed, 1 skipped; 1381 tests passed, 16 skipped. `yarn typecheck`: no errors.
- **Not run:** the migration against a database; the routes against Supabase; the card and the profile in a browser as a member.

## Manual checks before release

- [ ] Apply the migration, deploy, then check `https://pursio.fun/api/founding/availability` answers `{"available":true}`.
- [ ] As the buyer of `txn_01m7z81vac5vprjm7277mbw2fe`: the profile shows the badge and the founding outfit, Settings shows "Founding member", the landing card shows "You're a founding member".

## Follow-ups

- After the deploy: replay live notification `ntf_01m7z84s7gfk9v2qy98yar9rb0` (the `transaction.completed` of the first founding purchase, made before this code) so that buyer becomes a member.
