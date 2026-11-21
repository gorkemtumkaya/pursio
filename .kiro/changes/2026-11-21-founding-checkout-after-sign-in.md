# Changes: Founding checkout opens by itself after sign-in

On 2026-11-21 the owner asked that a visitor who registers through the landing page's founding card is taken to checkout automatically. Before, they came back signed in and had to press the button again. Earlier batch: [2026-11-21-founding-fulfillment.md](2026-11-21-founding-fulfillment.md) (`329afce`).

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Size:** 2 files changed, in 1 group

## Groups

### G1. Carry the buying intent through sign-in

A guest's click adds `?founding=checkout` to the URL before the sign-in dialog opens. Both sign-in ways (Google, email link) in `save` mode return to the current URL with its query ([useAuth.ts](../../app/composables/useAuth.ts), `startGoogle` and `sendEmail`), so the flag comes back with the visitor. A page that was opened with the flag waits for the session to be signed in, removes the flag and opens checkout once.

| File | Why it changed |
|---|---|
| [app/components/landing/LandingFounding.vue](../../app/components/landing/LandingFounding.vue) | Sets the flag on a guest's click; on a page loaded with the flag, opens checkout when the session is signed in |
| [CHANGELOG.md](../../CHANGELOG.md) | One line under Unreleased |

- **Related, not changed:** `becomeFoundingMember` still checks the limit of 50 and existing membership right before opening, so the automatic open never sells a 51st spot or a second membership.
- **Watch for:**
  - Only a page opened with the flag opens checkout by itself. The tab where the guest clicked gets the flag afterwards, so an email link that opens a new tab does not lead to two checkouts.
  - A guest who closes the dialog keeps the flag in the URL. Nothing happens until that URL is opened by a signed-in session.
  - An email link opened on another device signs in there and opens checkout there.

## Verification

- **Run:** `yarn vitest run`: 144 files passed, 1 skipped; 1381 tests passed, 16 skipped. `yarn typecheck`: no errors. In a headless browser on the dev server: a guest opening `/?landing=1&founding=checkout` gets no checkout and no dialog, and no page errors.
- **Not run:** the click and the return from sign-in. The dev server has checkout switched off, and sign-in cannot be automated.

## Manual checks before release

- [ ] As a guest on the landing page, press "Become a founding member", sign in with Google: back on the page, checkout opens by itself and the URL has no `founding=checkout`.
- [ ] The same with the email link.
