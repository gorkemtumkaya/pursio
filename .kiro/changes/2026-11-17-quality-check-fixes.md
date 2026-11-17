# Changes: quality check fixes

Fixes from the project-wide quality check on 2026-11-17: a failing config test, missing Fresh setup docs, two build warnings, stale steering, and a new bug ledger.

- **Repos and branches:** `pursio` (current branch)
- **State:** committed in `dd9c42e`
- **Size:** 14 files changed (1 moved), 2 added, in 5 groups

## Review order

1. G1 and G2: config and docs for the Fresh check job; they belong together.
2. G3: the Wick module move touches imports in 8 files.
3. G4, G5: small.

## Groups

### G1. Fresh check secret in the example env file (fresh task 10.2)

`tests/unit/fresh-config-smoke.test.ts` failed because the key was missing. Without it, a deploy from the example has no secret, so `/api/fresh/check` answers 404 and Fresh never refreshes.

| File | Why it changed |
|---|---|
| [.env.example](../../.env.example) | Adds `NUXT_FRESH_CHECK_SECRET` with a placeholder |

- **Related, not changed:** [nuxt.config.ts](../../nuxt.config.ts) (`freshCheckSecret` was already there), [server/utils/fresh/runtime.ts](../../server/utils/fresh/runtime.ts)
- **Not changed:** `.kiro/specs/fresh/tasks.md` task 10.2 is left unchecked; tick it if you agree it is done.

### G2. Fresh setup in the Supabase guide

| File | Why it changed |
|---|---|
| [supabase/README.md](../../supabase/README.md) | Lists the three Fresh migrations and adds a "Fresh check job" section with the `fresh_check_secret` Vault setup, timeout and rollback, copied from the migration header |

- **Related, not changed:** [supabase/migrations/20261112000200_fresh_check_cron.sql](../../supabase/migrations/20261112000200_fresh_check_cron.sql) (source of the instructions)

### G3. Wick helper moved out of `components/` (build warning NUXT_B3011)

`wick.vue` and `wick.ts` both resolved to the component name `MascotWick`. The `.ts` file holds types, palettes and `toWickOutfit`, so it now lives in `app/utils/`.

| File | Why it changed |
|---|---|
| [app/utils/wick.ts](../../app/utils/wick.ts) | Moved from `app/components/mascot/wick.ts`, content unchanged |
| [app/components/mascot/wick.vue](../../app/components/mascot/wick.vue) | Imports from `~/utils/wick` |
| [app/composables/useHobbyBuilder.ts](../../app/composables/useHobbyBuilder.ts), [app/components/path/PathView.vue](../../app/components/path/PathView.vue), [app/components/path/PathUnlockCard.vue](../../app/components/path/PathUnlockCard.vue), [app/components/path/PathDesktopHeader.vue](../../app/components/path/PathDesktopHeader.vue), [app/components/ProfileHero.vue](../../app/components/ProfileHero.vue), [app/pages/profile.vue](../../app/pages/profile.vue), [app/pages/new.vue](../../app/pages/new.vue) | Import path updated |

- **Watch for:** `app/utils/` is auto-imported, so `WICK_OUTFITS`, `WICK_PALETTES` and `toWickOutfit` are now available without an import. No name clashes in typecheck or build.

### G4. Duplicate auto-imports of the video ranking helpers

| File | Why it changed |
|---|---|
| [server/utils/video/ranking.ts](../../server/utils/video/ranking.ts) | Drops the re-export of `GOAL_BONUS`, `baseScore`, `goalAdjustment`; nobody imported them from here, and Nitro saw them twice |

### G5. Steering and bug ledger

| File | Why it changed |
|---|---|
| [.kiro/steering/structure.md](../steering/structure.md) | `server/` is no longer "(later)" |
| [.kiro/steering/tech.md](../steering/tech.md) | Backend line describes what is used now (no Edge Functions or pgvector yet) |
| [KNOWN_BUGS.md](../../KNOWN_BUGS.md) | New ledger with the owner's known Fresh bugs and the in-memory rate limit finding |

## Not changed on purpose

- Hardcoded outfit colors in `wick.vue`: likely deliberate, since the hobby sets the outfit, not the theme. Waiting for the owner.
- `yarn audit` advisories (glob, minimatch, picomatch): build-time only, under nuxt → nitropack.
- Demo videos and channel-source backfill: known to the owner, data work rather than a bug, so not in the ledger.
- No `CHANGELOG.md` entry: nothing here changes what users see.

## Verification

- **Run:** `yarn test`: 1054 passed, 11 skipped, 0 failed (before: 1 failed). `yarn typecheck`: clean, no warnings (before: 4 warnings). `yarn build`: succeeds; only the chunk-size warning remains.
- **Not run:** the Fresh check job against a real Supabase project.

## Follow-ups

- Write down the symptoms of APP-FRESH-01 to 03 and add `BUG-` tests.
- APP-SEC-01: move rate limits to Postgres.
