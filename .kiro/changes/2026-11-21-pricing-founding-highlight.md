# Changes: founding card highlighted, badge removed, smaller cards

On 2026-11-21, after [2026-11-21-plus-coming-next.md](2026-11-21-plus-coming-next.md) was committed, the owner asked for four follow-ups on `/pricing`: highlight the founding card, not Plus; remove the "MOST POPULAR" badge; put the founding card back on the right; and make the cards smaller ("cards are too big").

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Size:** 6 files changed, 1 added, in 3 groups

## Groups

### G1. Card order, highlight and badge

The order is Free, Plus, Founding member again. This replaces G2 of the earlier summary, which put founding in the middle.

| File | Why it changed |
|---|---|
| [app/utils/pricing-tiers.ts](../../app/utils/pricing-tiers.ts) | Founding member is last and has `featured: true`; Plus has `featured: false` |
| [app/components/pricing/PricingTierCard.vue](../../app/components/pricing/PricingTierCard.vue) | The badge and its `showBadge` logic are removed |
| [app/utils/pricing-copy.ts](../../app/utils/pricing-copy.ts) | `featuredBadge` text removed |
| [tests/unit/paddle-pricing.test.ts](../../tests/unit/paddle-pricing.test.ts) | Expected order of price IDs |
| [CHANGELOG.md](../../CHANGELOG.md) | The Unreleased line reworded |

- **Watch for:** `featured` now only sets the border and shadow. The earlier decision "badge on Yearly only" no longer applies, because the badge is gone.

### G2. Smaller cards

The long Plus list stretched all three cards to about 810 px at desktop width, with a lot of empty space in Free and Founding member. The cards are now about 645 px.

| File | Why it changed |
|---|---|
| [app/components/pricing/PricingTierCard.vue](../../app/components/pricing/PricingTierCard.vue) | Padding 32 to 24 px on wide screens, gaps 16 to 12 px, title 34 to 26 px, price 48 to 40 px, feature text 16 to 15 px, planned items 15 to 14 px, check box 26 to 22 px, buttons 56 to 48 px tall with 16 px text |

- **Watch for:**
  - The sizes are the agent's choice; the owner gave no numbers.
  - The cards still share one height, so Free and Founding member keep some empty space above their buttons.
  - Phone padding (22 px) is unchanged.

### G3. Refund line under the tax line (asked 2026-11-21)

| File | Why it changed |
|---|---|
| [app/utils/pricing-copy.ts](../../app/utils/pricing-copy.ts) | `refundNote` "Full refund within 30 days of a payment, no questions asked." and `refundLink` "Refund policy" |
| [app/components/pricing/PricingView.vue](../../app/components/pricing/PricingView.vue) | The line under the tax line, with a link to `/refund` |

- **Watch for:** the wording is the agent's, taken from the Refund page and the landing FAQ. It covers both Plus and founding membership.

## Verification

- **Run:** `yarn vitest run`: 145 files passed, 1 skipped; 1394 tests passed, 16 skipped. `yarn typecheck`: no errors. Headless Chrome screenshot of `/pricing` at 1280 px.
- **Not run:** a phone-width check; the Yearly toggle in the browser.
