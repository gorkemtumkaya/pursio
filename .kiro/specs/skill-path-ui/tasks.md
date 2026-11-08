# Implementation Plan: skill-path-ui

## Overview

The plan follows the four layers of the design, bottom up: test setup and shared types, then the pure data and logic modules (schema, validator, loader, Sample_Tree, Progress_Engine, XP, Progress_Store, Path_Layout, view helpers), then theme tokens, composables, Vue components and finally the `/path` page that wires them together. Each pure module is followed by its fast-check property tests (at least 100 runs each, tagged `// Feature: skill-path-ui, Property N: <title>`), so errors surface right after the code is written. Everything is TypeScript (strict, no `any`), `<script setup lang="ts">` for components.

Validation for every task: `yarn test` (vitest single run) and `yarn typecheck` must exit 0. Do not start `yarn dev` or any watcher; manual browser checks from the design's "Manual checks" list are for the user.

## Tasks

- [x] 1. Set up dependencies, test runner and shared types
  - [x] 1.1 Add dependencies and the test runner
    - Run `yarn add --exact zod elkjs` and `yarn add --dev --exact fast-check vitest`; use the design versions (zod 4.6.7, elkjs 0.12.1, fast-check 4.10.2, vitest 5.1.0) or, if they changed, the exact installed versions. No other new dependency. Commit the updated `yarn.lock`
    - Confirm `package.json` versions have no `^`, `~`, `>`, `<`, `*` or `x`
    - Add `"test": "vitest run"` to `scripts`
    - Create `vitest.config.ts` with `environment: 'node'` and aliases `#shared` → `./shared`, `~` → `./app`, `~~` → `.`; include `tests/**/*.test.ts`
    - Create `tests/property/` and `tests/unit/` with a trivial smoke test so `yarn test` exits 0
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.7_

  - [x] 1.2 Define the shared types
    - `shared/types/skill-tree.ts`: `Level`, `QuestTriple<T>`, `SkillNode`, `Section`, `SkillTree`
    - `shared/types/validation.ts`: `Result<T, E>`, `SchemaError`, `GraphError` union, `ValidationError`
    - `shared/types/progress.ts`: `Progress`, `NodeState`, `CompletionResult`
    - Use explicit imports only (no Nuxt auto-imports) so vitest can load them
    - _Requirements: 1.9_

- [x] 2. Implement the Tree_Schema
  - [x] 2.1 Create `shared/utils/skill-tree-schema.ts`
    - zod `text` (`z.string().regex(/\S/)`), `nodeSchema` with `quests: z.tuple([text, text, text])`, `sectionSchema` with `nodes.min(1)`, `skillTreeSchema` with `sections.min(1)` and `mascot.set`
    - `parseSkillTree(input: unknown)` uses `safeParse`, maps every zod issue to `{ kind: 'schema', path, message }`, converts symbol path keys with `String()`, returns path `[]` for a root mismatch, never throws
    - Add the compile-time `Equals<z.infer<typeof skillTreeSchema>, SkillTree>` drift check so `yarn typecheck` fails when schema and types diverge
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 2.2 Create the fast-check generators in `tests/arbitraries.ts`
    - `arbShapeTree`, `arbValidTree` (1–3 Sections, 1–15 Nodes each, unique ids, acyclic, prerequisites may point to later Sections), `arbPathTree` (satisfies P1 and P2, milestones last in some Sections, several side quests sharing an anchor), `arbLinearMainTree`, `arbProgress(tree)`
    - Small helpers used by tests: document positions, descendants of a Node, Main_Node list
    - _Requirements: 2.7, 14.6_

  - [x] 2.3 Write property test for schema round trip
    - **Property 1: Schema round trip**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.10**
    - File: `tests/property/skill-tree-schema.property.test.ts`, `numRuns: 100` or more

  - [x] 2.4 Write property test for mismatch reporting
    - **Property 2: Schema rejects every mismatch at its path**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6**
    - Include non-object roots (null, list, string, number, boolean) with a single `[]` path error

  - [x] 2.5 Write property test for unknown keys
    - **Property 3: Unknown keys are dropped silently**
    - **Validates: Requirements 1.7**

  - [x] 2.6 Write property test for schema ignoring graph rules
    - **Property 4: Schema ignores graph rules**
    - **Validates: Requirements 1.8**

- [x] 3. Implement the Tree_Validator and tree loading
  - [x] 3.1 Create `shared/utils/skill-tree-validate.ts`
    - `validateSkillTree(tree)`: index positions and occurrences; `duplicate_id` once per repeated id; `missing_prerequisite` once per distinct (node, unknown id) pair; cycle detection with iterative Tarjan SCC over known ids only, one simple cycle per non-trivial SCC or self edge, extracted by BFS from the lowest-position member
    - Sort by kind (duplicate, missing, cycle), then by document position of the first named id, ties in discovery order
    - Never mutate the input
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.11_

  - [x] 3.2 Write property test for valid trees
    - **Property 5: Valid trees produce no graph errors**
    - **Validates: Requirements 2.6, 2.7**
    - File: `tests/property/skill-tree-validate.property.test.ts`

  - [x] 3.3 Write property test for duplicate ids
    - **Property 6: Duplicated ids are reported once each**
    - **Validates: Requirements 2.1, 2.8**

  - [x] 3.4 Write property test for unknown prerequisites
    - **Property 7: Unknown prerequisites are reported per pair and never as cycles**
    - **Validates: Requirements 2.2, 2.4, 2.9**

  - [x] 3.5 Write property test for added back edges
    - **Property 8: Added back edges are reported as well-formed cycles**
    - **Validates: Requirements 2.3, 2.10**

  - [x] 3.6 Write property test for error completeness and order
    - **Property 9: Errors are complete and ordered**
    - **Validates: Requirements 2.5**

  - [x] 3.7 Write property test for validator purity
    - **Property 10: Validator is pure**
    - **Validates: Requirements 2.11**

  - [x] 3.8 Create `shared/utils/skill-tree-load.ts`
    - `loadSkillTree(input)`: schema first, return schema errors without running the validator; otherwise run `validateSkillTree` and return its errors or the tree
    - `formatValidationError(error)` for every kind, e.g. `sections.0.nodes.2.quests: Expected 3 items`, `Duplicate id "gear-basics"`, `"flagging" needs unknown skill "first-v3"`, `Prerequisite loop: a → b → a`
    - _Requirements: 3.8_

  - [x]* 3.9 Write unit tests for tree loading
    - File: `tests/unit/skill-tree-load.test.ts`
    - Schema-invalid input returns only schema errors and the validator is not called; graph-invalid input returns graph errors; `formatValidationError` output for each kind
    - _Requirements: 3.8_

- [x] 4. Add the Sample_Tree
  - [x] 4.1 Create `data/sample-bouldering.json`
    - Hobby "Bouldering", `mascot.set` "bouldering", Sections "First sessions" (beginner) and "Technique" (intermediate), the 13 slug ids, titles, prerequisites and flags from the design's "Sample_Tree ids" table
    - Write a short description and 3 quests per Node in the style of the reference designs (Footwork basics uses the reference quests)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.2 Write the Sample_Tree test
    - File: `tests/unit/sample-tree.test.ts`
    - Check hobby, mascot, Section titles and levels, the 13 titles in order, the single side quest and its prerequisite, milestones last and main, the linear Main_Node chain, and zero errors from `loadSkillTree`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 5. Checkpoint - Ensure all tests pass
  - Run `yarn test` and `yarn typecheck`. Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement the Progress_Engine and XP math
  - [x] 6.1 Create `shared/utils/progress-engine.ts`
    - `emptyProgress`, `isAvailable`, `findCurrentNodeId` (first available Main_Node in document order), `deriveNodeStates` (ordered rules completed → current → side_quest → milestone → locked), `markComplete` (same object and `completed: false` for unknown, completed or unavailable ids; otherwise a new Progress with the id appended, `quests` untouched, `kind` and `nextCurrentId`), `toggleQuest`, `checkedCount`, `diffUnlocked`, `activeSectionIndex`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.13, 9.1, 9.5_

  - [x] 6.2 Write property test for node states
    - **Property 11: Node states match the rule table**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.8**
    - File: `tests/property/progress-engine.property.test.ts`; use an independent oracle in the test

  - [x] 6.3 Write property test for ready nodes
    - **Property 12: Ready nodes have their prerequisites done**
    - **Validates: Requirements 4.4, 4.9**

  - [x] 6.4 Write property test for unlocking
    - **Property 13: Completing a node unlocks exactly the satisfied nodes**
    - **Validates: Requirements 4.6, 4.7, 9.1**

  - [x] 6.5 Write property test for invalid completions
    - **Property 14: Invalid completions change nothing**
    - **Validates: Requirements 4.10, 4.13**

  - [x] 6.6 Write property test for walking the path
    - **Property 15: Walking the path finishes in main-node-count steps**
    - **Validates: Requirements 4.11**

  - [x]* 6.7 Write unit tests for the unlock diff on the Sample_Tree
    - File: `tests/unit/progress-engine.test.ts`
    - Completing "Reading grades" unlocks only "Warm-up routine" (`current`) and "Falling safely" (`side_quest`); `toggleQuest` creates `[false, false, false]` first and ignores unknown ids
    - _Requirements: 9.5, 8.7_

  - [x] 6.8 Create `shared/utils/xp.ts`
    - `XP_PER_NODE = 50`, `LEVEL_THRESHOLDS = [0, 100, 200, 400, 700]`, `STATIC_STREAK = 6`, `xpFor` (counts only ids present in the tree), `levelFor`, `xpSummary` (`"<xp> / <next> XP"` and rounded percent below level 5, `"<xp> XP"` and 100 at level 5)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6_

  - [x] 6.9 Write property test for XP and levels
    - **Property 26: XP and level math**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.9**
    - File: `tests/property/xp.property.test.ts`

  - [x]* 6.10 Write unit tests for XP edges
    - File: `tests/unit/xp.test.ts`; XP values 0, 99, 100, 199, 200, 399, 400, 699, 700, 750
    - _Requirements: 11.2, 11.3, 11.4_

- [x] 7. Implement the Progress_Store
  - [x] 7.1 Create `app/utils/progress-store.ts`
    - `PROGRESS_SCHEMA_VERSION = 1`, `progressStorageKey(hobby)` → `pursio-progress:v1:<hobby>`, `serializeProgress`, `parseStoredProgress` (zod `storedProgressSchema`, `invalid` flag, collapse duplicate completed ids), `pruneProgress`, `StorageLike`, `createProgressStore(getStorage, tree)` with `load` (remove invalid value, prune) and `save`
    - Wrap every storage call in `try/catch`; a `null` storage or a throw gives empty Progress on load and a silent no-op on save
    - Use explicit relative or `#shared` imports so vitest loads it without Nuxt
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 7.2 Write property test for the stored round trip
    - **Property 23: Stored progress round trip**
    - **Validates: Requirements 10.7**
    - File: `tests/property/progress-store.property.test.ts`

  - [x] 7.3 Write property test for corrupt stored values
    - **Property 24: Corrupt stored values fall back to empty**
    - **Validates: Requirements 10.4**

  - [x] 7.4 Write property test for pruning
    - **Property 25: Pruning keeps exactly the known ids**
    - **Validates: Requirements 10.5**

  - [x]* 7.5 Write unit tests for the store with a fake storage
    - File: `tests/unit/progress-store.test.ts`
    - `save` calls `setItem` with the versioned hobby key; missing key gives empty Progress; invalid value is removed; storage whose methods throw gives empty Progress and a silent save
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.6_

- [x] 8. Implement the Path_Layout
  - [x] 8.1 Create `app/utils/path-layout.ts` with config, order check and ELK graph
    - Types `Point`, `NodeKind`, `NodePlacement`, `HeaderPlacement`, `TrailSegment`, `PathLayout`, `LayoutError`, `ViewportClass`, `ElkLike`
    - `LAYOUT_CONFIG` for mobile and desktop with every value from the design table
    - `checkPathOrder` (P1 and P2, returns `unsupported_order` naming the offending pair), `buildElkGraph` (children and edges in document order, prerequisite edges plus Main_Node trail edges, `layered`, `DOWN`, `randomSeed: 1`, `considerModelOrder.strategy: NODES_AND_EDGES`), `trailDots` (28%, 50%, 72%)
    - _Requirements: 5.1, 5.6, 6.1_

  - [x] 8.2 Add `placePath` and `computePathLayout` to `app/utils/path-layout.ts`
    - `placePath`: verify elkjs Main_Node order and completeness (`layout_failed` otherwise); place header bands and Main_Nodes with `windingOffsets[i % 4]`, `sectionLead`, `rowGap`, `sectionTail`; place side quests at `sideX` from the anchor midpoint, pushed below header bands and earlier side footprints; compute `height` and one segment per (prerequisite, dependent) pair
    - `computePathLayout(tree, viewport, elk)`: `checkPathOrder` → `buildElkGraph` → `await elk.layout()` in `try/catch` → `placePath`; any throw becomes `layout_failed`
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.7, 5.8, 5.9, 5.10, 5.12, 6.1_

  - [x] 8.3 Write property test for the winding trail
    - **Property 16: Main nodes follow the winding trail**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.6**
    - File: `tests/property/path-layout.property.test.ts`; import `elkjs/lib/elk.bundled.js` once and reuse the instance; `fc.asyncProperty` with `numRuns: 100`

  - [x] 8.4 Write property test for side quest placement
    - **Property 17: Side quests sit on the side column at or below their slot**
    - **Validates: Requirements 5.5**

  - [x] 8.5 Write property test for vertical order
    - **Property 18: Every node is placed below its prerequisites**
    - **Validates: Requirements 5.8**

  - [x] 8.6 Write property test for overlaps
    - **Property 19: Nothing overlaps**
    - **Validates: Requirements 5.7, 5.9**

  - [x] 8.7 Write property test for determinism
    - **Property 20: Layout is deterministic**
    - **Validates: Requirements 5.10**

  - [x]* 8.8 Write unit tests for layout examples
    - File: `tests/unit/path-layout.test.ts`
    - `buildElkGraph(sample)` options and edges; "Falling safely" at `cx = 110` and the exact midpoint of "Reading grades" and "Warm-up routine" on mobile; a throwing `ElkLike` gives `layout_failed`; a P1 violation gives `unsupported_order`
    - _Requirements: 5.1, 5.5, 5.12_

- [x] 9. Implement view helpers
  - [x] 9.1 Create `app/utils/node-visual.ts`
    - `nodeVisual` (static Tailwind class strings per state per the design table, including milestone current with `bg-gold`, `shadow-raised-gold`, trophy and milestone size), progress ring degrees (`checked * 120`), `statusLine`, `chipFor`, `buttonFor`, `formatTitleList`, `segmentTone`
    - _Requirements: 4.12, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 8.4, 8.9, 8.10, 8.11, 8.12_

  - [x] 9.2 Write property test for trail segments
    - **Property 21: Trail segments match prerequisite links**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Add to `tests/property/path-layout.property.test.ts` (after 8.7, same file)

  - [x]* 9.3 Write unit tests for visual mappings
    - File: `tests/unit/node-visual.test.ts`
    - `nodeVisual` per state including milestone current, ring degrees for 0–3 checks, `statusLine`, `chipFor`, `buttonFor` per state, `formatTitleList` with 1, 2 and 3 titles
    - _Requirements: 4.12, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.11, 6.12, 8.4, 8.9, 8.10, 8.11, 8.12_

  - [x] 9.4 Create `app/utils/section-headers.ts`
    - `sectionHeaderModels(tree, progress)`: eyebrow "SECTION N · LEVEL", one banner at `activeSectionIndex` with `{ done, total }` over Main_Nodes, dividers otherwise, `lockedBy` = last incomplete Milestone_Node title of the previous Section for dividers
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 9.5 Write property test for section headers
    - **Property 22: Section headers have one banner and correct counts**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
    - File: `tests/property/section-headers.property.test.ts`

  - [x] 9.6 Create `app/utils/fresh-samples.ts`
    - `FreshItem` type (kind video or article, title, source, duration or read time) and fixed sample entries per Sample_Tree node id, with a fallback list for unknown ids
    - _Requirements: 8.6_

- [x] 10. Checkpoint - Ensure all tests pass
  - Run `yarn test` and `yarn typecheck`. Ensure all tests pass, ask the user if questions arise.

- [x] 11. Add theme additions
  - [x] 11.1 Extend `app/assets/css/main.css` and `/dev/theme`
    - Add `--shadow-raised-line: 0 6px 0 var(--pursio-line);` to `@theme inline`
    - Add `@keyframes pursio-unlock` (scale pop, used at 450 ms)
    - Add a sample element using `shadow-raised-line` to the "Raised buttons" section of `app/pages/dev/theme.vue`
    - _Requirements: 6.8, 9.5, 13.3, 13.4_

- [x] 12. Implement composables
  - [x] 12.1 Create `app/composables/useViewportClass.ts`
    - `null` until mounted, then `matchMedia('(min-width: 1024px)')` → `'desktop' | 'mobile'`, updates on change, removes the listener on unmount
    - _Requirements: 5.13, 12.10_

  - [x] 12.2 Create `app/composables/usePathLayout.ts`
    - Dynamic `import('elkjs/lib/elk.bundled.js')` on the client, one cached `ELK` instance; `watch(viewport, …, { immediate: true })` with a request token that discards stale results; `status` `loading | ready | error`, `layout`
    - _Requirements: 5.11, 5.12, 5.13_

  - [x] 12.3 Create `app/composables/useSkillPath.ts`
    - `progress` starts as `emptyProgress()` on server and client; `onMounted` loads from `createProgressStore` with a guarded `window.localStorage` getter
    - Computed `states`, `currentId`, `activeSection`, `xp`; `toggleQuest` and `complete` call the pure engine, assign, then `store.save()` in the same tick; `complete` returns `{ result, unlocked }` or null
    - _Requirements: 8.7, 9.1, 10.1, 10.2, 10.3, 10.6, 10.8, 11.5_

  - [x] 12.4 Create `app/composables/useFocusTrap.ts`
    - Focus `initialFocus` when `active` becomes true; Tab and Shift+Tab wrap using focusables queried at keypress time; Escape calls `onEscape`
    - _Requirements: 8.13, 8.14, 8.17, 9.4_

- [x] 13. Build the view components in `app/components/path/`
  - [x] 13.1 Create `PathIcon.vue`
    - Inline SVG icons for every `IconName` in the design, `stroke="currentColor"`, `stroke-width="2.2"`, `stroke-linecap="round"`, `aria-hidden="true"`
    - _Requirements: 6.13, 13.1, 13.7_

  - [x] 13.2 Create the shell components
    - `PathNavItems` (Path as `NuxtLink to="/path"` with `aria-current="page"`, other items `type="button"` no-ops), `PathBottomNav` (fixed, `h-20`, Path, Fresh, Quests, Profile), `PathSidebar` (logo, Path, Fresh feed, Quests, Profile, "Your hobbies", "+ Add a hobby"), `PathXpBar` (`role="progressbar"`), `PathMobileHeader` (two rows, `sr-only` `<h1>`), `PathDesktopHeader` ("YOUR PATH", `font-display` `<h1>`, stats right), `PathStatus` (loading `role="status"`, error `role="alert"` with `text-ink` on `bg-surface`)
    - Typed props and emits, token utilities only, 44 px minimum hit areas
    - _Requirements: 11.3, 11.4, 11.6, 11.7, 11.8, 12.1, 12.2, 12.3, 12.7, 12.8, 13.6, 13.8_

  - [x] 13.3 Create the path canvas components
    - `PathTrail` (one `aria-hidden` SVG, nested `<svg x="50%" overflow="visible">`, circles `fill="currentColor"` with `text-done` or `text-trail` from `segmentTone`), `PathSectionHeader` (banner and divider styles, fixed band height, "X/Y skills", "Reach <title> to unlock" with lock icon), `PathNode` (`<button>` with `aria-label="<title>, <status>"`, classes from `nodeVisual`, desktop selection outline, `motion-safe` unlock animation), `PathProgressRing` (`rounded-node`, scoped `conic-gradient` with `var(--pursio-primary)` and `var(--pursio-line)`, `--ring-deg` inline), `PathNextUpTag`, `PathNodeLabel` (`aria-hidden`, muted title when locked, wrapping with `maxWidth`)
    - `PathCanvas`: relative box of `layout.height`, `overflow-x: clip`, positions with `left: calc(50% + Xpx)` and `top: Ypx`, `ResizeObserver` for `halfColumn` to compute label max widths, emits `select(id, el)`
    - _Requirements: 4.12, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 6.13, 7.1, 7.2, 7.3, 7.4, 7.5, 8.15, 9.5, 9.6, 12.9, 13.1, 13.4, 13.5, 13.6_

  - [x] 13.4 Create the node detail components
    - `PathQuestItem` (`<label>` with visually hidden checkbox, `min-h-12`, done box and struck-through `text-muted` when checked), `PathFreshList` (static `<article>` cards), `PathNodeDetail` (chip, "Section N · Skill M" on desktop, `font-head` title, description, "QUESTS · N OF 3" or the locked note, fresh list, action button per `buttonFor`), `PathBottomSheet` (`Teleport` to body, `role="dialog"`, `aria-modal`, `bg-overlay` backdrop closes, `useFocusTrap` with initial focus on close, slide-up with `motion-reduce:transition-none`, body scroll lock), `PathSidePanel` (`<aside aria-label="Skill details">`, sticky, `h-dvh`, scrollable), `PathWeekCard` (Mon–Sun dots, "3 of 4 sessions")
    - _Requirements: 8.1, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12, 8.13, 8.14, 8.17, 12.4, 12.5, 12.6, 13.6, 13.8_

  - [x] 13.5 Create `PathUnlockCard.vue`
    - Modal dialog over `bg-overlay`, "+50 XP" in `font-display`, "<title> complete", next title or "Path complete", Continue button with initial focus via `useFocusTrap`, no Escape or backdrop dismissal
    - _Requirements: 9.3, 9.4, 9.6, 13.6, 13.8_

- [x] 14. Wire the `/path` page
  - [x] 14.1 Create `app/pages/path.vue` with loading, shell and selection
    - `loadSkillTree(sample)` in setup; on failure render only `PathStatus` error with `formatValidationError` of the first error and no layout
    - Use `useSkillPath`, `useViewportClass`, `usePathLayout`; SSR and first client render show the loading state; `PathStatus` error "This path could not be drawn." on layout error
    - Mobile shell (header, canvas, bottom nav with `bottomPadding`) and desktop grid `grid-cols-[248px_minmax(0,1fr)_clamp(360px,30vw,460px)]`, center column `max-w-160`
    - Selection state: `selectedId`, `sheetOpen`, `openerId`, `effectiveSelectedId` fallback; tap opens the sheet on mobile, click selects on desktop; closing the sheet keeps checks and returns focus to the opener; state survives viewport switches
    - Quest toggles call `toggleQuest`
    - _Requirements: 3.8, 5.11, 5.12, 5.13, 8.1, 8.2, 8.3, 8.7, 8.13, 8.15, 8.16, 10.2, 10.8, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.9, 12.10_

  - [x] 14.2 Add the completion flow to `app/pages/path.vue`
    - `onComplete(id)`: call `complete`; set `animating` to the unlocked ids unless `prefers-reduced-motion: reduce`, clear after 600 ms; Main_Node opens `PathUnlockCard` with the next Current_Node title or "Path complete"; side quest closes the sheet and focuses its node on mobile, stays selected on desktop
    - Continue: close card, close sheet on mobile with focus to the opener, select the new Current_Node or keep the completed node
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 10.1, 11.5, 7.6, 7.7_

  - [x] 14.3 Write the conventions test
    - File: `tests/unit/conventions.test.ts`
    - Scan `app/components/path/**` and `app/pages/path.vue` for hex colors, `rgb(`, `hsl(`, `oklch(`, CSS named colors in style or `fill`/`stroke`, literal `font-family`, `border-radius` and `box-shadow` values, blurred shadows, emoji code points and `any` types
    - Check that `package.json` pins `zod`, `elkjs`, `fast-check` and `vitest` without range characters and that no other dependency was added
    - _Requirements: 13.1, 13.5, 13.7, 13.10, 14.1, 14.2_

  - [x] 14.4 Write the contrast test and fix failing tokens
    - File: `tests/unit/contrast.test.ts`
    - Parse `app/assets/css/themes.css` and check the design's text/background pairs reach 4.5:1 in trail, boulder and halloween
    - If a pair fails, adjust the token value in `themes.css` (not the component) and update the `/dev/theme` swatch if needed
    - _Requirements: 13.2, 13.9_

- [x] 15. Update the changelog
  - [x] 15.1 Create or update `CHANGELOG.md` in the project root
    - Create it in "Keep a Changelog" format with a `## [Unreleased]` section if it does not exist; never rewrite existing entries
    - Under "Added", one user-facing line per visible change, each ending with "(spec: skill-path-ui)": the bouldering path view at `/path` with sections, side quest and milestones; skill details with quests (bottom sheet on mobile, side panel on desktop); marking skills complete with the unlock moment and XP and levels; progress saved in the browser
    - Do not log tests, refactors or the test setup
    - _Requirements: 3.1, 6.1, 8.1, 9.3, 10.1, 11.1_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Run `yarn test` and `yarn typecheck`; both must exit 0. Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. Property tests, the Sample_Tree test, the conventions test and the contrast test are not optional because Requirements 3.7, 13.1, 13.9, 14.1 and 14.6 require them.
- Every property test uses fast-check with at least 100 runs and a tag comment `// Feature: skill-path-ui, Property N: <title>`.
- Validation uses `yarn test` and `yarn typecheck` only. Browser checks (hydration warnings, focus behavior, widths 320–1920 px, reduced motion, theme switching) are listed under "Manual checks" in the design and are run by the user with `yarn dev`.
- Pure modules use explicit relative or `#shared` imports so vitest loads them without Nuxt.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "4.1", "6.8", "9.6", "11.1", "12.1", "12.4", "13.1"] },
    { "id": 2, "tasks": ["2.3", "3.1", "6.1", "6.9", "6.10", "7.1", "8.1"] },
    { "id": 3, "tasks": ["2.4", "3.2", "3.8", "6.2", "7.2", "8.2", "9.1", "9.4"] },
    { "id": 4, "tasks": ["2.5", "3.3", "3.9", "4.2", "6.3", "7.3", "8.3", "9.3", "9.5", "12.2", "12.3"] },
    { "id": 5, "tasks": ["2.6", "3.4", "6.4", "6.7", "7.4", "8.4", "13.2"] },
    { "id": 6, "tasks": ["3.5", "6.5", "7.5", "8.5", "13.3"] },
    { "id": 7, "tasks": ["3.6", "6.6", "8.6", "13.4"] },
    { "id": 8, "tasks": ["3.7", "8.7", "8.8", "13.5"] },
    { "id": 9, "tasks": ["9.2", "14.1"] },
    { "id": 10, "tasks": ["14.2"] },
    { "id": 11, "tasks": ["14.3", "14.4"] },
    { "id": 12, "tasks": ["15.1"] }
  ]
}
```
