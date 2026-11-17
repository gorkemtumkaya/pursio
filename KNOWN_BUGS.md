# Known bugs

What is broken in Pursio right now, and the history of every bug fixed or accepted. Process: global steering `bug-fixes.md`.

IDs are `APP-<AREA>-NN` and are never reused. Severity: **Critical** can be exploited without an account; **High** hits users on the main path or exposes data; **Medium** is a wrong result or a dead end in a less common path; **Low** is minor or latent.

## Bugs with a test

None yet. Bug tests are named `BUG-<ID>: …` and marked `it.fails`; list them with `yarn test -t "BUG-"`.

## Bugs without a test yet

| ID | Severity | Where | What | Suggested fix |
|---|---|---|---|---|
| APP-FRESH-01 | Medium | Fresh feed ranking, variety rule ([shared/utils/fresh-rank.ts](shared/utils/fresh-rank.ts), Req 9.13, 9.14) | Reported by the owner: the Fresh feed does not keep the intended variety. Exact symptom still to be written down. | Reproduce with a failing `BUG-APP-FRESH-01` test, then fix. |
| APP-FRESH-02 | Low | Fresh video cards ([app/components/fresh/FreshVideoCard.vue](app/components/fresh/FreshVideoCard.vue)) | Reported by the owner: card layout needs fixes. Details still to be written down. | Compare with `dev_docs/Mobile · Fresh@1x.png` and `dev_docs/Desktop · Fresh@1x.png`. |
| APP-FRESH-03 | Low | Fresh hero card ([app/components/fresh/FreshHeroCard.vue](app/components/fresh/FreshHeroCard.vue)) | Reported by the owner: hero card layout needs fixes. Details still to be written down. | Compare with the same Fresh mockups. |
| APP-SEC-01 | Medium | [server/utils/rate-limiter.ts](server/utils/rate-limiter.ts), used by [server/utils/llm-runtime.ts](server/utils/llm-runtime.ts), video and fresh runtimes | Limits are kept in memory per serverless instance, and keyed by user id. Anonymous accounts are free to create, so a script can spread tree generations over new sessions and over Vercel instances and spend the default LLM key beyond 10 per user per hour. The only brake is Supabase's anonymous sign-in limit per IP (documented in `supabase/README.md`). | Move the limit to Postgres (a counter table or function shared by all instances), and add a global daily cap on default-key calls. |

## Accepted risks

None yet.

## Fixed

None yet.
