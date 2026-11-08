# Design Document: local-progress-data

## Overview

Two new localStorage records and two pure modules replace the Path_View placeholders. Everything stays client-side; SSR and the first client render keep showing the loading state, as in `skill-path-ui`. Demo_Mode keeps its placeholders, now collected in one module.

## Architecture

```
index.vue ──addHobby──▶ hobby-store ──▶ localStorage (pursio-hobbies:v1, pursio-progress:v1:hobby:<id>)
path.vue  ──loadHobbyLibrary / pickHobby / hobbyEntries──▶ PathView(tree, demo, hobbies, activeId)
PathView  ──useSkillPath (Progress)  ──useActivity (Completion_Log) ──▶ headers, PathWeekCard, PathSidebar, hobby Bottom_Sheet
useActivity ──streak.ts (pure)  ──activity-store ──▶ localStorage (pursio-activity:v1)
```

Pure logic (`shared/utils/streak.ts`, `completionPercent`) has no storage access. Stores take a `getStorage` function, like the Progress_Store, so tests pass an in-memory storage.

## Components and Interfaces

### `shared/utils/streak.ts` (pure)

- `localDayKey(ms)`: `YYYY-MM-DD` from local `getFullYear/getMonth/getDate`.
- `streakDays(completions, now)`: build the set of day keys; start at today if present, else yesterday if present, else return 0; step back one Local_Day at a time with `new Date(y, m, d - 1)` (DST-safe) while the key is in the set.
- `weekDays(completions, now)`: seven `{ date, name, short, status: 'done' | 'missed' | 'upcoming' }` entries from the Monday of `now`'s week (`(getDay() + 6) % 7` days back).
- `weekSummary(days)`: "1 day this week" / "n days this week".
- `appendCompletion(completions, ms, limit = 1000)`: appends and keeps the last `limit`.

### `app/utils/activity-store.ts`

`createActivityStore(getStorage)` with `load(): number[]` and `save(completions)`. `parseCompletionLog(raw)` is exported for tests.

### `app/utils/hobby-store.ts`

- `hobbyId(tree) = normalizeHobby(tree.hobby)`, `hobbyProgressKey(id)`, `hobbyPath(id)`.
- `parseHobbyLibrary(raw)` and `serializeHobbyLibrary(library)`.
- `loadHobbyLibrary(getStorage)`: parse; when the key is missing, migrate the legacy Generated_Tree (copy its Progress to the new key, save the library, remove both legacy keys).
- `addHobby(getStorage, { tree, model }, now)`: replace in place or append, set `activeId`, remove the entry's Progress key; returns the id.
- `setActiveHobby(getStorage, id)`.
- `pickHobby(library, requestedId)`: requested, else active, else last, else `null` (Req 3.6).
- `hobbyEntries(getStorage, library)`: `HobbyEntry[]` (`{ id, hobby, percent, to }`) with each entry's stored percent.
- `completionPercent(tree, progress)` lives in `shared/utils/progress-engine.ts`; the sidebar uses it for every entry and the Path_View for the live entry.

### UI wiring

- `app/pages/path.vue`: Demo_Mode as before. Otherwise, after mount, load the library and `pickHobby` with `route.query.hobby`; none means `navigateTo('/', { replace: true })`. Saves the active id and passes `demo`, `hobbies` and `activeId` to `PathView`.
- `PathView`: `useActivity(demo)` gives `streak`, `week` and `weekSummary` (demo values in Demo_Mode, no writes). `onComplete` records a completion after a successful `complete`. The live entry's percent overrides the stored one. Fresh items are `freshFor(id)` in Demo_Mode, else `[]`.
- `PathHobbyList` (new): the hobby list and "+ Add a hobby", used by `PathSidebar` and the hobby Bottom_Sheet. An entry with `to: null` renders the old no-op button (demo entries). `PathHobbyProgress` draws the name and bar inside either.
- `PathMobileHeader`: the Hobby_Switcher emits `switch`, carries `aria-haspopup="dialog"` and `aria-expanded`, and exposes `focusSwitcher()` for focus return.
- `PathWeekCard`: takes `days` and `summary` props. The demo week (with its "planned" day), demo streak and demo hobbies live in `app/utils/demo-placeholders.ts`.
- `PathNavItems`: only Path. `PathNodeDetail`: `PathFreshList` only when `fresh.length > 0`.
- `app/pages/index.vue`: `addHobby` instead of `saveGeneratedTree`, then `navigateTo(hobbyPath(id))`.

## Data Models

| Data | Key | Shape |
| --- | --- | --- |
| Completion_Log | `pursio-activity:v1` | `{ "completions": number[] }` (epoch ms, oldest first, max 1000) |
| Hobby_Library | `pursio-hobbies:v1` | `{ "hobbies": [{ "id", "tree", "model", "addedAt" }], "activeId": string \| null }` |
| Progress per entry | `pursio-progress:v1:hobby:<id>` | unchanged Progress JSON |

The stored `id` is informational: on load it is recomputed from the tree, so it always matches the Progress key. Legacy keys `pursio-generated-tree:v1` and `pursio-progress:v1:generated` are read once for migration (Req 3.4) and then removed. The Sample_Tree keeps `pursio-progress:v1:bouldering`, so it never collides with a library entry.

## Correctness Properties

Checked by example unit tests (the scope allows logic tests only, not property suites).

### Property 1: The Streak counts only a live run of days

The Streak is 0 exactly when neither today nor yesterday has a completion, and never exceeds the number of distinct Local_Days in the log. **Validates: Requirements 1.2**

### Property 2: Order and repeats do not matter

The Streak and the Week do not depend on the order of the log, and several completions on one day count once. **Validates: Requirements 1.2, 2.1**

### Property 3: The Completion_Log is bounded

The Completion_Log never holds more than 1000 entries, and the newest entry is always kept. **Validates: Requirements 1.4**

### Property 4: Hobbies keep separate Progress

Adding a hobby changes only that hobby's Progress key; every other Progress key is unchanged. **Validates: Requirements 3.2, 3.3**

### Property 5: Hobby_Library round trip

A library round-trips through `serializeHobbyLibrary` and `parseHobbyLibrary`. **Validates: Requirements 3.5**

## Error Handling

- Storage missing or throwing: every load gives an empty value and every save is a silent no-op, as in the Progress_Store.
- Unreadable Completion_Log or Hobby_Library value: treated as empty and removed.
- Bad library entries (Tree_Loader rejection, empty model, non-numeric `addedAt`, repeated id): dropped; the rest load.
- Migration: the legacy keys are removed only after the new library was written.
- An unknown `?hobby=` id falls back to the Active_Hobby; an empty library redirects to the Start_Screen.

## Testing Strategy

Unit tests only, in `tests/unit/`: `streak.test.ts` (empty log, today-only, yesterday-only, gap breaks, several entries per day, order, DST and month boundaries, week statuses and Monday start, Sunday week, summary, cap at 1000), `activity-store.test.ts` (round trip, unreadable removal, storage throws), `hobby-store.test.ts` (add, replace resets only own Progress, invalid entries dropped, legacy migration and its failure case, `pickHobby` order, `hobbyEntries`), and a `completionPercent` case in `progress-engine.test.ts`. Dates are built with local-time constructors so tests pass in any time zone. Manual check: `/path`, `/path?hobby=<id>` and `/path?demo=1` on mobile and desktop widths.
