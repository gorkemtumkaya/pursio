# Implementation Plan: New Hobby Page

## Overview

Port `docs/design/new-hobby.html` to Vue and Tailwind tokens, replacing `app/pages/index.vue`. Add the learner's starting level end to end (shared types, server prompt input and cache key, client request), then build small components and one composable, then the page. All paths are relative to the project root `/Users/gorkem/eosthinks/pursio`. See `design.md` for the interfaces. Only the level-in-request test is added. Follow the project secrets rule: no environment secret files are read or edited.

## Tasks

- [x] 1. Shared level type and prompt sentence
  - [x] 1.1 Add the starting level to the shared code
    - In `shared/types/llm.ts` add `export type StartLevel = 'new' | 'some' | 'serious'`.
    - In `shared/utils/llm.ts` add `START_LEVELS`, `DEFAULT_LEVEL` (`'new'`), `LEVEL_LABELS` (`New to it`, `Tried it a bit`, `Getting serious`), `isStartLevel(value)` and `levelInstruction(level)`.
    - `levelInstruction` returns exactly `The learner's starting level is: <label lowercased>. Start the tree at that level.`
    - _Design: Shared_

- [x] 2. Server: pass the level into generation
  - [x] 2.1 Send the level in the provider user message
    - In `server/utils/providers/types.ts` add `level: StartLevel` to `GenerateOptions` and a `userMessage(hobby, level)` helper returning the hobby, a blank line, then `levelInstruction(level)`.
    - In `server/utils/providers/anthropic.ts` and `openai.ts` use `userMessage(hobby, options.level)` instead of `hobby` for the user content.
    - Leave `server/prompts/skill-tree.md` unchanged.
    - _Design: Server_

  - [x] 2.2 Thread the level through the generator, cache and handler
    - `server/utils/generator.ts`: change to `generateSkillTree(hobby, level, config, deps)` and pass `level` to every `adapter.generateTree` call, including the retry.
    - `server/utils/tree-cache.ts`: change to `cacheKey(hobby, level, provider, model)` (JSON array, normalized hobby).
    - `server/utils/llm-handlers.ts`: after the hobby check read `body.level`. Missing becomes `DEFAULT_LEVEL`. A value that fails `isStartLevel` returns `treeError('invalid_input')`. Pass the level to `cacheKey` and `generateSkillTree`.
    - Fix any other caller found with a search for `generateSkillTree(` and `cacheKey(`.
    - _Design: Server_

- [x] 3. Client request and summary helpers
  - [x] 3.1 Add the level to the tree request
    - In `app/utils/tree-client.ts` change to `buildTreeRequest(hobby, level, settings)`. `body` always has `{ hobby, level }`, plus `provider` and `model` when an own key is set. Update the `TreeRequest` type.
    - _Design: Client utils_

  - [x] 3.2 Write the unit test for the level in the API request
    - Create `tests/unit/tree-client.test.ts` using vitest (see an existing unit test for style and `LlmSettings` fixtures from `app/utils/llm-settings.ts`).
    - Check `buildTreeRequest('guitar', 'some', <no key>)` has `body.level === 'some'` and `body.hobby === 'guitar'`.
    - Check the same with an own key set: `body.level` is still `'some'` and `provider`, `model` are present.
    - This is the only new test file for this spec.
    - _Design: Testing Strategy_

  - [x] 3.3 Add the tree summary helper
    - Create `app/utils/tree-summary.ts` with `TreeSummary` and `summarizeTree(tree: SkillTree)` returning `skills` (all nodes), `sections`, `quests` (sum of each node's quests) and `firstSkill` (title of the first node of the first section).
    - _Design: Client utils_

- [x] 4. Presentational components
  - [x] 4.1 Create `app/components/hobby/HobbyLevelPicker.vue`
    - `defineProps<{ modelValue: StartLevel }>()`, `defineEmits<{ 'update:modelValue': [StartLevel] }>()`.
    - Three buttons in a `role="group"` labelled by a visible "Where are you now?" label. Use `aria-pressed`, labels from `LEVEL_LABELS`, grid of 3 on `bg-surface-2` with `rounded-2xl`. Pressed button: `bg-surface text-ink`. Others: `text-muted`. Min height 46 px (`min-h-12`).
    - _Design: Components_

  - [x] 4.2 Create `app/components/hobby/HobbyIdeaChips.vue`
    - Props `ideas: readonly string[]`, `surprise?: boolean`, `disabled?: boolean`. Emits `pick` (string) and `surprise`.
    - A "Or try" label, then one button per idea with `rounded-full border-2 border-line bg-surface text-ink`, `h-10`, `text-sm font-bold`. Do not use `rounded-node`.
    - When `surprise` is true add a "Surprise me" chip: `border-dashed border-primary bg-primary-soft text-accent-text`. Text only.
    - Focus ring: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`.
    - _Design: Components_

  - [x] 4.3 Create `app/components/hobby/HobbyBuildSteps.vue` and `HobbyReadyCard.vue`
    - `HobbyBuildSteps`: props `steps: readonly string[]`, `active: number`. A `role="progressbar"` bar (`h-3.5 rounded-full bg-surface-2`, fill `bg-primary`, width `((active + 0.5) / steps.length) * 100%`, `motion-safe:transition-[width]`) and an `<ol>`. Steps before `active` are done (`bg-done`, `PathIcon name="check"` in `text-done-ink`), the active step has a `bg-primary` dot, the rest `bg-locked` with `text-muted`. Add the note "Usually takes about 15 seconds."
    - `HobbyReadyCard`: prop `summary: TreeSummary`, emit `open`. Three count tiles (skills, sections, quests) on `bg-surface-2`, the line "First up: <firstSkill>", and a full-width primary button "Open my path". Focus the button in `onMounted`.
    - Primary button classes come from the current `index.vue` (`h-14 rounded-2xl bg-primary font-head text-lg font-semibold text-primary-ink shadow-raised-primary`).
    - _Design: Components_

  - [x] 4.4 Create `app/components/hobby/HobbyBenefits.vue`
    - Static "What you'll get" section with three cards: "A skill path", "Small daily quests", "Fresh content", with the copy from `docs/design/new-hobby.html`. Cards use `rounded-3xl border-2 border-line bg-surface`. Small icons use `PathIcon` and token colors.
    - Hidden below `sm` (`hidden sm:flex`).
    - _Design: Components_

- [x] 5. Builder composable
  - [x] 5.1 Create `app/composables/useHobbyBuilder.ts`
    - Implement the interface in `design.md`: states `input | generating | ready | error`, `BUILD_STEPS`, `STEP_INTERVAL_MS = 3500`, `TIMEOUT_MS = 90_000`.
    - Move the fetch, timeout, `loadSkillTree`, `addHobby`, `errorCodeFrom` and `friendlyMessage` logic from the current `app/pages/index.vue`. Call `buildTreeRequest(value, level.value, loadSettings(browserStorage))`.
    - The step timer advances `stepIndex` up to the last step and stops there. It never sets `ready`. The response sets `ready`, clears the timer, stores `summary` from `summarizeTree` and `outfit` from `toWickOutfit(tree.mascot.set)` (import from `~/components/mascot/wick`).
    - Failures set `errorCode` and `errorMessage` and keep `hobby`. Add `pickIdea`, `surprise` (pool: pottery, birdwatching, calligraphy, skateboarding, origami, trail running), `openPath` (`navigateTo(hobbyPath(id))`) and an `onScopeDispose` that clears the timer and aborts the request.
    - No `any`. Narrow the unknown response with the same checks the page uses today.
    - _Design: Composable_

- [x] 6. Page and app shell
  - [x] 6.1 Rewrite `app/pages/index.vue` to the new design
    - Use `useHobbyBuilder()` and `useTheme()`. Keep `useHead({ title: 'Pursio' })`.
    - Layout from `design.md`: top bar (brand with `PathIcon name="star"`, Settings `NuxtLink` to `/settings`), hero with `<MascotWick :theme="theme" :mood :outfit :size="220" />` and a bubble (`bg-ink text-bg font-display rounded-2xl`), the four cards, then `<HobbyBenefits />`.
    - Mood/outfit/bubble per the state table in `design.md`: `think` while generating, `cheer` when ready.
    - Input card: `<form @submit.prevent="build">` with the labelled input (`maxlength="60"`), `HobbyLevelPicker`, "Build my path" button, `HobbyIdeaChips` (bouldering, film photography, guitar, sourdough baking, chess; surprise on). Error card: `not_a_hobby` shows the design copy, other codes show `errorMessage`; retry input bound to the same `hobby`, four chips, "Try again" submit.
    - Status text in an `aria-live="polite"` region. Focus the retry input on error.
    - Token utilities only: no hex colors, no raw font names, no `rounded-node` on chips, no arbitrary shadows. No dev theme switcher markup in this file.
    - _Design: Page_

  - [x] 6.2 Hide the dev theme switcher on the new hobby page
    - In `app/app.vue` add `const route = useRoute()` and change to `<DevThemeSwitcher v-if="isDev && route.path !== '/'" />`.
    - _Design: App shell_

- [x] 7. Checkpoint - Verify
  - Run `yarn typecheck`, `yarn test` and `yarn build`. Fix errors. Search `app/` and `server/` for leftover callers of the old `buildTreeRequest`, `generateSkillTree` and `cacheKey` signatures. Ask the user if questions arise.

- [x] 8. Changelog
  - [x] 8.1 Add the CHANGELOG entry
    - In `CHANGELOG.md` under `## [Unreleased]` / `### Changed` add one line, without editing existing entries: `- The start page has a new look: Wick reacts while your path is built, and you can say how far along you are in the hobby so the path starts at the right level. (spec: new-hobby-page)`
    - _Design: Overview_


## Notes

- There are no optional tasks: the user asked for a single test (3.2) and no others.
- The design has no correctness properties, so no property-based tests are planned.
- Server-side level validation and the step timing are checked by typecheck, build and a manual pass with `yarn dev`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.3", "4.1", "4.2", "4.3", "4.4", "6.2"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "5.1"] },
    { "id": 3, "tasks": ["6.1"] },
    { "id": 4, "tasks": ["8.1"] },
    { "id": 5, "tasks": ["9.1"] }
  ]
}
```
