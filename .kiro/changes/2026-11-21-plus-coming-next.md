# Changes: Plus card shows today and coming next

On 2026-11-21 the owner asked for the Plus card on `/pricing` to list what Plus includes today and what is planned, and for founding membership to be the middle card. Earlier work: [2026-11-21-hobby-limit.md](2026-11-21-hobby-limit.md).

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Size:** 5 files changed, 1 added, in 3 groups

## Review order

1. G1: the copy and how planned features are shown.
2. G3: the Terms sentence, which is legal text.
3. G2: card order.

## Groups

### G1. Plus: "What you get today" and "Coming next"

The Plus card has two lists. Today's list keeps the green check marks. The planned list is muted, smaller and has a plain dot in place of a check, so it does not read as available. Under it is the line "Plus members get each of these as it ships, at no extra cost." All of this text is in one file.

| File | Why it changed |
|---|---|
| [app/utils/pricing-tiers.ts](../../app/utils/pricing-tiers.ts) | `Tier.featuresHeading` and `Tier.upcoming` (heading, items with name and detail, note); the Plus copy as the owner wrote it |
| [app/components/pricing/PricingTierCard.vue](../../app/components/pricing/PricingTierCard.vue) | Renders the heading, the muted list and the note; other cards are unchanged |

- **Watch for:**
  - The two old Plus lines "Everything in Free" and "Plus features as they ship, at no extra cost" are gone; the owner's lists replace them.
  - No dates and no dash characters are in the new copy. "7-day free trial" on the same card is older text and was left alone.

### G2. Founding member is the middle card

| File | Why it changed |
|---|---|
| [app/utils/pricing-tiers.ts](../../app/utils/pricing-tiers.ts) | Order is Free, Founding member, Plus |
| [tests/unit/paddle-pricing.test.ts](../../tests/unit/paddle-pricing.test.ts) | Expected order of price IDs |

- **Watch for:** Plus keeps the highlighted border and the "MOST POPULAR" badge on Yearly, now on the right card. The owner's words were "put the founding member to center not montly"; moving the highlight to the founding card was not asked and was not done.

### G3. Terms: planned features can change

| File | Why it changed |
|---|---|
| [app/utils/legal-copy.ts](../../app/utils/legal-copy.ts) | "Free app, Plus and founding membership": "Plus features shown as coming next are plans, not promises: they can change, arrive later or not arrive at all." |
| [CHANGELOG.md](../../CHANGELOG.md) | One line under Unreleased |

- **Watch for:** the sentence is the agent's wording, not reviewed by a lawyer.

## Not changed on purpose

- **The landing page founding card and the limit card:** the owner asked for no other changes.
- **`LEGAL_UPDATED`** already reads 21 November 2026, today's date.

## Verification

- **Run:** `yarn vitest run`: 145 files passed, 1 skipped; 1394 tests passed, 16 skipped. `yarn typecheck`: no errors. Headless Chrome screenshot of `/pricing` on the dev server at 1280 px: three cards in the new order, the Plus lists as described.
- **Not run:** a phone-width check; the Yearly toggle after the reorder.
