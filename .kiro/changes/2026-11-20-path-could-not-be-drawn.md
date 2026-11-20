# Changes: A generated path could not be drawn

On 2026-11-20 the owner's generated "Walking" path showed only "This path could not be drawn." The console said `unsupported_order`: `route-planning` requires `first-30-minute-walk`. The owner asked to plan and fix it without a review stop ("plan and fix it, i will be afk").

- **Repos and branches:** `pursio` `main`
- **State:** uncommitted
- **Status:** 1 of 1 done
- **Size:** 10 files changed, 2 added, in 1 group
- **Update, same day:** the first version of this fix (S1) did not open "Walking"; the owner reloaded and got the same error. So `route-planning` is a main skill that needs a side quest. S5 was added for it.

## Scenarios

| ID | Starting state | Action | Expected result | Bug | Status |
|---|---|---|---|---|---|
| S1 | A saved path whose side quest is listed before the skill it needs (the "Walking" path) | Open the path | The path is drawn; the side quest sits below that skill | APP-PATH-03 | Done |
| S2 | The AI answers with a tree where a main skill needs a side quest or a later skill | Create a path | The answer is rejected and the generator retries once with the reason; a second bad answer gives the usual "generation failed" error | APP-PATH-03 | Done |
| S3 | A saved path where a main skill needs a later main skill, or a side quest that is drawn below it | Open the path | Still "This path could not be drawn." | APP-PATH-03 | Open (decision 1) |
| S4 | Any saved path that could be drawn before | Open the path | Drawn exactly as before | — | Done |
| S5 | A saved path where a main skill needs a side quest that hangs from an earlier main skill (the "Walking" path, second attempt) | Open the path | The path is drawn; the side quest sits above that main skill, with a dotted link from the side quest to it. The main skill stays locked until the side quest is done | APP-PATH-03 | Done |

## Review order

1. G1 is the only group. [shared/utils/path-order.ts](../../shared/utils/path-order.ts) is the whole rule; read it first.

## Groups

### G1. A side quest may come before the skill it needs (APP-PATH-03, S1–S4)

**Cause:** the layout refused any tree where a side quest's prerequisite comes later in the document ([design.md, "Path order precondition"](../specs/skill-path-ui/design.md), rule P2). The generation prompt ([server/prompts/skill-tree.md:11-13](../../server/prompts/skill-tree.md#L11-L13)) puts the milestone last in each section and lets a side quest need any main skill of its section, so a side quest that needs the milestone is always listed before it. The generator only checked ids, unknown prerequisites and loops, so such a tree was saved and could then never be opened.

**Approach:** since the overlap fix (`e2b28c2`) a side quest is placed below the main skill it hangs from, whatever its place in the document, so the rule is dropped for side quests. The rule that stays (a main skill only needs earlier main skills) is now also checked at generation.

| File | Why it changed |
|---|---|
| [shared/utils/path-order.ts](../../shared/utils/path-order.ts) | New home of the order rule, so server and app share it; a side quest may need any skill of the tree; a main skill may need a side quest that is drawn above it (not at generation: `strict`) |
| [app/utils/path-layout.ts](../../app/utils/path-layout.ts) `trailStart` | The link from a side quest back to a main skill starts at the side quest's left edge, beside its label |
| [app/utils/path-layout.ts](../../app/utils/path-layout.ts) `checkPathOrder` | Now a thin wrapper around the shared rule |
| [shared/utils/skill-tree-load.ts](../../shared/utils/skill-tree-load.ts), [shared/types/validation.ts](../../shared/types/validation.ts) | New option `requirePathOrder` and error kind `path_order`, with a sentence the model gets in the retry note |
| [server/utils/generator.ts:78](../../server/utils/generator.ts#L78) | Generation asks for the order check, so a tree that cannot be drawn is never saved |
| [tests/unit/path-layout.test.ts](../../tests/unit/path-layout.test.ts) | The "Walking" shape drawn with real elkjs on both viewports; P2 examples |
| [tests/unit/skill-tree-load.test.ts](../../tests/unit/skill-tree-load.test.ts) | The new option and the error text |
| [tests/property/tree-route.property.test.ts](../../tests/property/tree-route.property.test.ts) | Its fake AI answers now come from `arbPathTree`; random trees with a bad order are rejected by design now |
| [.kiro/specs/skill-path-ui/design.md](../specs/skill-path-ui/design.md) | P2 rewritten |
| [CHANGELOG.md](../../CHANGELOG.md), [KNOWN_BUGS.md](../../KNOWN_BUGS.md) | User-facing line under Unreleased; ledger entry under Fixed |

- **Must not change:** loading a saved tree does not run the order check (only generation does), so no saved path is rejected at load; a new tree where a main skill needs a side quest is refused at generation; progress rules; every path that could be drawn before is drawn the same (S4).
- **Related, not changed:** [server/prompts/skill-tree.md](../../server/prompts/skill-tree.md) (already asks for the order that is now enforced), [shared/utils/progress-engine.ts](../../shared/utils/progress-engine.ts) (works on prerequisite ids, not on document order).
- **Watch for:**
  - The "Walking" tree itself was still not seen. After the failed first attempt the remaining cases are S5 (fixed) and S3 (a main skill that needs a later main skill, or a side quest drawn below it), which is still refused.
  - S5 and progress: while the needed side quest is open, no main skill is available, so there is no "NEXT UP" skill until the side quest is done. Nothing in the progress rules changed; this is what the saved tree asks for.
  - When the link from the side quest to the main skill crosses a section header, it has no dots, like every other link.
  - Generation is stricter: an answer with a bad main-skill order now costs the one retry, and fails if the retry is bad too. Before, it was saved and broke on opening.

## Decisions

1. **What to do with saved paths that still cannot be drawn (S3)?** Open. None is known to exist. Options: repair on load (make the main skill need the previous main skill instead), or offer to regenerate. Recommended: wait until one shows up, then repair on load.
3. **Draw a main skill that needs a side quest, or repair the tree?** Decided by the agent, 2026-11-20: draw it as saved (S5), because that changes no saved data and no progress rule. To be confirmed by the owner.
2. **Reject or repair at generation?** Decided by the agent while the owner was away, 2026-11-20: reject and retry, because that is how every other tree error is handled. To be confirmed by the owner.

## Not changed on purpose

- The earlier summary [2026-11-20-path-label-overlap.md](2026-11-20-path-label-overlap.md) is committed; only its State line got the commit hash.
- The `ai-skill-tree-generation` spec was not edited; see Follow-ups.

## Verification

- **Run:** `yarn vitest run`: 128 files passed, 1 skipped; 1253 tests passed, 16 skipped. `yarn nuxt typecheck`: no errors.
- **Not run:** lint (the project has no ESLint); the app was not started, and the real "Walking" path was not opened.

## Manual checks before release

- [ ] S5: open the "Walking" path; it is drawn, with "First 30 minute walk" as a side quest above "Route planning".
- [ ] S2: create one new path and open it.

## Follow-ups

- Decision 1 (S3).
- Add the order check to the `ai-skill-tree-generation` spec (requirements and the retry note).
