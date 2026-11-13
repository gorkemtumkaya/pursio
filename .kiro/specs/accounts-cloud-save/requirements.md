# Requirements Document

## Introduction

Today Pursio keeps everything in the browser's localStorage: the Hobby_Library, the Progress of each hobby and the Completion_Log. This feature moves that data to Supabase so a learner can come back on another device, without making anyone sign up first.

Every new visitor gets an anonymous Supabase session on arrival and can generate a tree and make progress at once. Signing up with Google or an email magic link upgrades that same user in place, so all data stays. Paths, progress and profile live in Postgres tables protected by Row Level Security. `POST /api/tree` requires a session, stores the generated path for that user and rate-limits per user instead of per IP. Existing localStorage data is imported into the account once. The learner can log out and delete the account with all its data. `/path?demo=1` keeps working without any account.

Scope limits: the implementation plan has at most 7 tasks. Automated tests cover logic only (pure functions and server handlers with mocks); there are no UI component tests and no tests that need a live Supabase project.

### Needs approval before work starts

The Supabase JavaScript client, `@supabase/supabase-js`, is a new package dependency. Per the project rules it is not installed until the user approves it. At the time of writing the latest version is 2.119.0, which needs Node 22 or newer (the project runs on Node 24). The version is pinned exactly when approved.

### Known limitation

Rate limiting per user instead of per IP means a script can create many anonymous users and use the default key without a shared cap. Supabase's own limit on anonymous sign-ins per IP, set in the dashboard, is the only brake on that. This is the behavior that was asked for and is accepted for the hackathon.

### Out of scope

Merging the data of an anonymous user into an existing account, passwords, other sign-in providers, sharing paths between users, syncing LLM_Settings or the API key to the cloud, offline editing with later sync, realtime sync between open tabs, XP or streak columns, and storing fresh content.

## Glossary

- **Skill_Tree, Node, Progress, Progress_Engine, Path_View, Unlock_Moment, Demo_Mode, Sample_Tree**: As defined in the `skill-path-ui` and `local-progress-data` specs.
- **Hobby_Library, Hobby_Id, Active_Hobby, Completion_Log, Streak, Week**: As defined in the `local-progress-data` spec.
- **Tree_Route, Tree_Cache, Rate_Limiter, Billable_Generation, Error_Code, Friendly_Message, LLM_Settings, Generated_Tree, User_Config, Provider_Adapter, Tree_Loader**: As defined in the `ai-skill-tree-generation` spec.
- **Start_Level, New_Hobby_Page**: As defined in the `new-hobby-page` spec. The New_Hobby_Page is the page at `/new`.
- **Settings_Page**: The page at `/settings`, as defined in the `ai-skill-tree-generation` spec.
- **Supabase_Client**: The `@supabase/supabase-js` client, created from the public URL and anon key in runtime config.
- **Session**: A Supabase auth session stored in the browser, holding an Access_Token.
- **Access_Token**: The JWT of a Session, sent to the server in the `Authorization: Bearer` header.
- **Anonymous_User**: The Supabase user created by anonymous sign-in, with `is_anonymous` set to true.
- **Account_User**: A Supabase user with a Google identity or a verified email and `is_anonymous` set to false.
- **Auth_Service**: The client module and composable that creates, upgrades, replaces and ends Sessions and tells pages the session status: `loading`, `anonymous`, `signed_in` or `unavailable`.
- **Auth_Dialog**: The dialog with the options "Continue with Google" and an email field with an "Email me a link" button. In `save` mode it upgrades the Anonymous_User. In `login` mode it signs in to an existing account.
- **Save_Prompt**: The Auth_Dialog in `save` mode with the title "Save your progress", shown to an Anonymous_User.
- **Profile_Page**: The page at `/profile`.
- **Cloud_Store**: The client module that reads and writes Profile_Rows, Path_Rows and Progress_Rows through the Supabase_Client under Row Level Security.
- **Profile_Row**: One row of `profiles`: `id` (the user id), `display_name`, `theme`, `created_at`.
- **Path_Row**: One row of `paths`: `id`, `user_id`, `hobby`, `hobby_id`, `level`, `tree`, `mascot_set`, `model`, `archived`, `created_at`.
- **Progress_Row**: One row of `progress`: `path_id`, `user_id`, `completed`, `quests`, `completed_at`, `updated_at`.
- **Completion_Timestamp**: The time at which a Node was completed, stored per Node id in `completed_at`.
- **Save_Queue**: The client module that sends Progress writes for one path one at a time, in order.
- **Legacy_Data**: The localStorage values written before this feature: the Hobby_Library, the earlier Generated_Tree and its Progress, the Progress of each Hobby_Library entry and the Completion_Log. Legacy_Data excludes the Sample_Tree's Progress, the theme and the LLM_Settings.
- **Legacy_Importer**: The client module that copies Legacy_Data into the account.
- **Delete_Route**: The Nuxt server route `DELETE /api/account`.
- **Service_Role_Key**: The Supabase service role key, read on the server from the environment variable `NUXT_SUPABASE_SERVICE_ROLE_KEY` through server-only runtime config.
- **Migrations**: The SQL files in `supabase/migrations/`.
- **Setup_Guide**: The file `supabase/README.md`.

## Requirements

### Requirement 1: Scope, dependency and configuration

**User Story:** As the project owner, I want this feature small and its new dependency and keys approved and documented, so that nothing unexpected enters the repo.

#### Acceptance Criteria

1. THE implementation plan SHALL contain no more than 7 tasks.
2. THE feature SHALL add `@supabase/supabase-js` as its only new package dependency (production or development), and THE implementation plan SHALL specify its installation at one exact version with no range operator (such as `^` or `~`).
3. THE example env file `.env.example` SHALL list each of `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY` and `NUXT_SUPABASE_SERVICE_ROLE_KEY` exactly once, and every value SHALL be a placeholder that is not a real credential.
4. THE `nuxt.config.ts` runtime config SHALL define `supabaseServiceRoleKey` as a server-only value (absent from the public runtime config), and SHALL define `supabaseUrl` and `supabaseAnonKey` as public values.
5. THE Service_Role_Key SHALL be read by the Delete_Route and by no other route, module or component.
6. THE feature SHALL open, search, print and edit no environment file other than `.env.example`, and SHALL write no environment variable value into chat output, code or commits.
7. THE client bundle and every route response, including error responses, SHALL NOT contain the Service_Role_Key value.
8. THE application logs SHALL NOT contain the Service_Role_Key value in any log entry, including entries written when a request fails.
9. THE implementation plan SHALL mark the `@supabase/supabase-js` install task as requiring explicit user approval, and SHALL NOT run the install command before that approval is given.

### Requirement 2: Database schema and Row Level Security

**User Story:** As a learner, I want my data stored so that only I can read or change it, so that my paths stay private.

#### Acceptance Criteria

1. THE Migrations SHALL be plain SQL files in `supabase/migrations/`, and applying them in file-name order to an empty Supabase project SHALL complete without error and create the tables `profiles`, `paths` and `progress`.
2. THE `profiles` table SHALL have the columns of the Profile_Row, with `id` as the primary key referencing `auth.users` with delete cascade, `display_name` as optional text of 1 to 40 characters, and `theme` restricted to `boulder`, `trail` or `halloween` with the default `boulder`. A write that sets `display_name` to more than 40 characters or `theme` to any other value SHALL be rejected with a database error and leave existing rows unchanged.
3. WHEN a row is inserted into `auth.users`, including a row for an Anonymous_User, THE Migrations' trigger SHALL insert exactly one Profile_Row with the same `id`, the `theme` set to `boulder` and `display_name` empty.
4. THE `paths` table SHALL have the columns of the Path_Row, with `user_id` referencing `auth.users` with delete cascade, `level` restricted to the Start_Level values `new`, `some` or `serious`, `tree` as non-null JSON, `archived` defaulting to false, and a unique constraint on (`user_id`, `hobby_id`). A write that violates the `level` restriction, the non-null `tree` or the unique constraint SHALL be rejected with a database error and leave existing rows unchanged.
5. THE `progress` table SHALL have the columns of the Progress_Row, with `path_id` as the primary key referencing `paths` with delete cascade, `completed` as the ordered list of completed Node ids defaulting to an empty list, `quests` as JSON in the stored Progress shape of the `skill-path-ui` spec defaulting to an empty object, and `completed_at` as JSON mapping Node ids to Completion_Timestamps defaulting to an empty object.
6. IF an insert or update would give a `progress` row a `user_id` that differs from the `user_id` of the Path_Row that `path_id` references, THEN THE `progress` table SHALL reject the statement with a database error and leave existing rows unchanged.
7. THE Migrations SHALL enable Row Level Security on `profiles`, `paths` and `progress`.
8. WHEN an authenticated user, including an Anonymous_User, selects, inserts, updates or deletes rows in `profiles`, `paths` or `progress`, THE Migrations' policies SHALL allow the operation only on rows whose owner is the user's own id (`id` in `profiles`, `user_id` in `paths` and `progress`). An insert or update that would set the owner to another user's id SHALL be rejected with a database error, and a select, update or delete aimed at another user's row SHALL affect zero rows.
9. THE Setup_Guide SHALL list the Supabase dashboard settings the feature needs: anonymous sign-ins enabled, manual identity linking enabled, the Google provider enabled, the site and redirect URLs for local development and production, a numeric limit of anonymous sign-ins per hour per IP address, and a note that the default Supabase mailer limits the number of magic-link emails per hour, with the current default figure stated.
10. THE Setup_Guide SHALL include a manual checklist, with one step and one expected result per line, that proves Row Level Security for each of `profiles`, `paths` and `progress`: a second user's select returns zero of the first user's rows, and the second user's update and delete each affect zero of the first user's rows.
11. IF the trigger fails to insert the Profile_Row when a row is inserted into `auth.users`, THEN THE Migrations' trigger SHALL cause the `auth.users` insert to fail with an error, so that no user exists without a Profile_Row.
12. WHILE a request has no Session, THE Migrations' policies SHALL make selects on `profiles`, `paths` and `progress` return zero rows, and SHALL reject inserts and make updates and deletes affect zero rows. The Setup_Guide checklist SHALL include a step that proves this for each table.

### Requirement 3: Anonymous session

**User Story:** As a first-time visitor, I want to start using Pursio right away, so that I do not need to sign up before seeing value.

#### Acceptance Criteria

1. WHEN a page outside Demo_Mode loads in the browser and no stored Session exists, THE Auth_Service SHALL set the status to `loading`, sign in anonymously once, store the new Session in the browser, and set the status to `anonymous`.
2. WHEN a page outside Demo_Mode loads in the browser and a stored Session exists, THE Auth_Service SHALL reuse that Session, SHALL create no new user, and SHALL set the status to `anonymous` or `signed_in` according to the stored Session's user type.
3. THE Auth_Service SHALL expose one composable that returns the session status (one of `loading`, `anonymous`, `signed_in`, `unavailable`), the user id, whether the user is anonymous, and the email of an Account_User. The user id SHALL be empty while the status is `loading` or `unavailable`, and the email SHALL be empty unless the status is `signed_in`.
4. WHILE the session status is `loading` or `unavailable`, THE Path_View, the New_Hobby_Page and the Profile_Page SHALL send zero Cloud_Store requests and zero Tree_Route requests.
5. IF anonymous sign-in returns an error, does not complete within 10 seconds, or the Supabase URL or anon key is empty, THEN THE Auth_Service SHALL set the status to `unavailable`, and THE page SHALL show the Friendly_Message "We couldn't start your account. Check your connection and try again." with a "Try again" button.
6. WHILE the session status is `loading`, THE Path_View, the New_Hobby_Page and the Profile_Page SHALL show their loading state in place of their content.
7. WHEN the user activates the "Try again" button, THE Auth_Service SHALL set the status to `loading` and repeat the anonymous sign-in, and IF the sign-in succeeds, THEN THE Auth_Service SHALL set the status to `anonymous` and THE page SHALL replace the Friendly_Message with its normal content.
8. IF a stored Session cannot be refreshed because it is expired or rejected by Supabase, THEN THE Auth_Service SHALL discard that Session from the browser and sign in anonymously as a new user.

### Requirement 4: Sign up and log in

**User Story:** As a learner, I want to keep my progress by signing in with Google or an email link, so that I can use it on any device without a password.

#### Acceptance Criteria

1. WHEN an Anonymous_User activates "Continue with Google" in the Auth_Dialog in `save` mode, THE Auth_Service SHALL link a Google identity to the current user and, on success, keep the user id unchanged.
2. WHEN an Anonymous_User submits a valid email in the Auth_Dialog in `save` mode, THE Auth_Service SHALL send a magic-link email to that address, and within 10 seconds of submission THE Auth_Dialog SHALL show "Check your email" with the address. A valid email is a string of at most 254 characters, with one "@", a non-empty part before it and a domain containing at least one "." after it.
3. WHEN an Anonymous_User completes the Google flow or opens the magic link in `save` mode, THE Auth_Service SHALL convert the current user to an Account_User with the same user id.
4. IF the submitted email is not a valid email address in either `save` or `login` mode, THEN THE Auth_Dialog SHALL show "Enter a valid email address.", send no email, and keep the entered text in the field.
5. IF the Google identity or the email already belongs to another account, THEN THE Auth_Dialog in `save` mode SHALL show "That account already exists. Log in instead. Progress from this device is not added to it." and THE Auth_Service SHALL keep the current Session and the current user's Path_Rows, Progress_Rows and Profile_Row unchanged.
6. WHEN a user activates "Continue with Google" in the Auth_Dialog in `login` mode, THE Auth_Service SHALL sign in to the account matching that Google identity. WHEN a user submits a valid email in the Auth_Dialog in `login` mode, THE Auth_Service SHALL send a magic-link email to that address, and within 10 seconds of submission THE Auth_Dialog SHALL show "Check your email" with the address. WHEN the user opens that magic link, THE Auth_Service SHALL sign in to the account matching that email.
7. WHEN a login completes, THE app SHALL open the Active_Hobby's path, or the New_Hobby_Page when the account has no Path_Row.
8. WHILE the current user is an Anonymous_User with at least one Path_Row, THE Auth_Dialog in `login` mode SHALL show "Logging in leaves this device's anonymous progress behind. To keep it, save your progress instead." above the Google and email options.
9. IF the app is opened from a magic link that has expired or was already used, or the Google flow is cancelled or fails, THEN THE app SHALL show the Friendly_Message "That sign-in didn't work. Try again." and keep the current Session.
10. THE Auth_Dialog SHALL contain no password field.
11. WHEN the Auth_Dialog opens, THE Auth_Dialog SHALL move keyboard focus to an element inside it. WHILE the Auth_Dialog is open, THE Auth_Dialog SHALL keep keyboard focus inside it, so that Tab from the last focusable element moves focus to the first and Shift+Tab from the first moves focus to the last. WHEN the user presses Escape, THE Auth_Dialog SHALL close, leave the Session unchanged and return focus to the element that opened it.
12. WHILE the session status is `anonymous` and the page is the New_Hobby_Page, THE New_Hobby_Page SHALL show a "Log in" link that opens the Auth_Dialog in `login` mode.
13. IF the magic-link email request fails or receives no response within 10 seconds, THEN THE Auth_Dialog SHALL show the Friendly_Message "That sign-in didn't work. Try again.", keep the entered email in the field, and THE Auth_Service SHALL keep the current Session.
14. WHILE a Google sign-in request or a magic-link email request is in progress, THE Auth_Dialog SHALL disable "Continue with Google" and the email submit control, so that at most one request is sent per activation.
15. WHEN the Auth_Service converts an Anonymous_User to an Account_User, THE Auth_Service SHALL keep every Path_Row, Progress_Row and Profile_Row of that user readable by that user.

### Requirement 5: Cloud_Store replaces localStorage for paths

**User Story:** As a learner, I want my hobbies to come from my account, so that they follow me to any device.

#### Acceptance Criteria

1. WHILE outside Demo_Mode, THE Cloud_Store SHALL be the only source of the Hobby_Library and of Progress, and THE app SHALL read the Legacy_Data only through the Legacy_Importer.
2. WHEN `/path` opens outside Demo_Mode and the session status is `anonymous` or `signed_in`, THE Cloud_Store SHALL load the user's Path_Rows and Progress_Rows, and THE Path_View SHALL pick the hobby to show by the rules of Requirement 3.6 of the `local-progress-data` spec: the `?hobby=<Hobby_Id>` entry, else the Active_Hobby, else the most recently created entry, skipping archived entries.
3. THE Active_Hobby SHALL stay a per-device preference in localStorage and SHALL NOT be stored in the account.
4. IF a Path_Row's `tree` is rejected by the Tree_Loader or the Path_Row has no `model`, THEN THE Cloud_Store SHALL leave that row out of the Hobby_Library, keep all other rows, and show no error message for the omitted row.
5. WHEN a hobby is archived, THE Cloud_Store SHALL set `archived` on its Path_Row to true, and WHEN a hobby is restored, THE Cloud_Store SHALL set `archived` on its Path_Row to false.
6. WHEN a hobby is deleted, THE Cloud_Store SHALL delete its Path_Row, which removes its Progress_Row, and THE Path_View SHALL offer an Undo action for 5 seconds, paused while the toast is hovered or focused.
7. WHEN the user activates Undo for a deleted hobby within the Undo period, THE Cloud_Store SHALL insert the Path_Row and Progress_Row again with the same Hobby_Id and their earlier content, including `archived`, `model`, `tree`, completed ids, quest entries and Completion_Timestamps.
8. WHEN the New_Hobby_Page receives a tree from the Tree_Route, THE New_Hobby_Page SHALL make the returned `pathId` the Active_Hobby and open `/path?hobby=<Hobby_Id>` without writing the tree to localStorage.
9. IF loading the user's rows fails, THEN THE Path_View SHALL show the Friendly_Message "We couldn't load your paths. Check your connection and try again." with a "Try again" button that repeats the load, THE Path_View SHALL show no hobby data, and THE app SHALL NOT fall back to localStorage.
10. FOR ALL Skill_Trees accepted by the Tree_Loader and all model ids, converting them to a Path_Row and back SHALL return a deeply equal Skill_Tree and an equal model id (round-trip property).
11. WHILE the Cloud_Store is loading the user's Path_Rows and Progress_Rows, THE Path_View SHALL show its loading state and SHALL NOT show a hobby or redirect.
12. IF the Cloud_Store fails to save an archive, restore, delete or Undo, THEN THE Cloud_Store SHALL keep the Hobby_Library and Progress as they were before the action, and THE Path_View SHALL show a Friendly_Message saying the change was not saved.

### Requirement 6: Progress, XP and Streak from the account

**User Story:** As a learner, I want every checked quest and completed skill saved to my account, so that I never lose progress.

#### Acceptance Criteria

1. WHEN the user toggles a quest or completes a Node outside Demo_Mode, THE Path_View SHALL show the updated quest state, ring, XP and level in the same render as the action, before any write finishes.
2. WHEN the user toggles a quest or completes a Node outside Demo_Mode, THE Save_Queue SHALL write the full Progress to the Progress_Row of that path, creating the row when absent.
3. WHEN a write for a path is in progress and further Progress updates for that path arrive, THE Save_Queue SHALL start no second write for that path, SHALL keep only the latest Progress as the single waiting write, and SHALL send that waiting write after the current write finishes. For ALL update sequences with a mocked writer, once all writes have finished, the stored Progress SHALL equal the last Progress produced (property).
4. IF a Progress write fails, THEN THE Path_View SHALL keep the latest Progress in memory, SHALL show a toast "Couldn't save your last change." with a "Retry" action, and SHALL send no automatic retry. The toast SHALL remain until the user selects "Retry", a later write for that path succeeds, or the user dismisses it.
5. WHEN the user selects "Retry", THE Save_Queue SHALL send the latest Progress for that path, and IF that write fails, THEN THE Path_View SHALL show the same toast again.
6. WHEN a Node is completed, THE Path_View SHALL store the current time as that Node's Completion_Timestamp in the Progress_Row, and later writes SHALL NOT change an existing Completion_Timestamp of that Node.
7. THE Path_View SHALL compute XP and level from the Progress with the existing XP functions, and THE database SHALL hold no XP, level or streak column.
8. WHEN the Path_View is shown or any Completion_Timestamp changes, THE Path_View SHALL compute the Streak and the Week card from the Completion_Timestamps of all the user's Progress_Rows, archived paths included, with the existing Streak and Week functions, in place of the Completion_Log. IF the user has no Completion_Timestamps, THEN the Streak SHALL be 0 and the Week card SHALL show no completed days.
9. WHEN a hobby is deleted, THE Streak and the Week card SHALL no longer count that hobby's Completion_Timestamps in the same render, and WHEN the deletion is undone they SHALL count them again in the same render.
10. WHEN a Progress_Row is loaded, THE Cloud_Store SHALL drop from the loaded Progress every completed id and quest entry whose Node id is not in the path's Skill_Tree, and SHALL NOT count XP or Completion_Timestamps of the dropped Nodes.
11. IF loading the user's Progress_Rows fails, THEN THE Path_View SHALL show an error state with a "Retry" action and SHALL NOT send any Progress write until a load succeeds, so that stored Progress is never overwritten by empty Progress.
12. FOR ALL valid Progress values with Completion_Timestamps, converting them to a Progress_Row and back SHALL return an equal Progress and equal Completion_Timestamps (round-trip property).

### Requirement 7: Profile and theme

**User Story:** As a learner, I want my theme and name saved to my account, so that Pursio looks the same on every device.

#### Acceptance Criteria

1. WHEN the session is ready outside Demo_Mode and the Profile_Row has a `theme` equal to one of "boulder", "trail" or "halloween", THE app SHALL apply that theme, replace any different theme stored in localStorage with it, and show it on screen.
2. WHEN the theme changes outside Demo_Mode and a Session exists, THE app SHALL save the new theme to the Profile_Row.
3. WHEN the theme changes, THE app SHALL store the new theme in localStorage.
4. THE Profile_Page SHALL show a display name field that accepts at most 40 characters, and WHEN the user submits it outside Demo_Mode while a Session exists, THE Cloud_Store SHALL save the value with leading and trailing whitespace removed to the Profile_Row, storing a value that is empty or whitespace-only as no name.
5. IF saving the theme or the display name fails, THEN THE app SHALL keep the current theme or the entered name on screen, leave the Profile_Row unchanged, not retry automatically, and show the Friendly_Message "Couldn't save that. Try again." for at least 5 seconds.
6. WHEN the app first renders in the browser and localStorage holds a theme equal to one of "boulder", "trail" or "halloween", THE app SHALL apply that theme before the first paint, without waiting for the Profile_Row to load.
7. IF the Profile_Row `theme` is missing or not one of "boulder", "trail" or "halloween", THEN THE app SHALL keep the current theme and SHALL NOT overwrite the Profile_Row `theme` as part of loading the session.

### Requirement 8: Import of existing localStorage data

**User Story:** As a returning learner, I want the paths and progress I already built in this browser carried into my account, so that this update loses nothing.

#### Acceptance Criteria

1. WHILE the app is outside Demo_Mode, WHEN the session becomes ready and Legacy_Data exists and the user has no Path_Row, THE Legacy_Importer SHALL create one Path_Row per valid Hobby_Library entry, including the entry of the earlier Generated_Tree, with `level` set to `new`, `archived` and `model` as stored (`archived` set to false if not stored), and `created_at` set to the entry's stored time.
2. WHEN the Legacy_Importer creates a Path_Row for an entry, THE Legacy_Importer SHALL create one Progress_Row for that entry from the entry's stored Progress, or an empty Progress_Row with no completed Nodes if the entry has no stored Progress.
3. WHEN the Legacy_Importer imports completed Nodes, THE Legacy_Importer SHALL assign Completion_Timestamps by taking the Completion_Log entries oldest first and assigning one to each completed Node in Hobby_Library order and then completion order, so that the Streak and Week card are unchanged when the number of Completion_Log entries equals the number of completed Nodes. Completed Nodes left without a Completion_Log entry SHALL have no Completion_Timestamp, and surplus Completion_Log entries SHALL be dropped.
4. WHEN the import finishes without a write error, THE Legacy_Importer SHALL set the Active_Hobby to the imported entry matching the stored `activeId`, or to the first imported entry in Hobby_Library order if `activeId` is absent or matches no imported entry, and SHALL then remove all Legacy_Data keys from localStorage.
5. IF any write of the import fails or the import takes longer than 10 seconds, THEN THE Legacy_Importer SHALL roll back so that the attempt leaves no Path_Row or Progress_Row, keep all Legacy_Data keys unchanged, show an error message indicating that the import failed, and run again on the next load without creating a duplicate Path_Row.
6. IF the user already has at least one Path_Row, THEN THE Legacy_Importer SHALL import nothing, leave the Legacy_Data keys and values unchanged, and not set the Active_Hobby.
7. IF a Hobby_Library entry is rejected by the Tree_Loader or has no model, THEN THE Legacy_Importer SHALL skip that entry without creating a Path_Row or Progress_Row for it and import the remaining entries. If every entry is skipped, THE Legacy_Importer SHALL create no rows, leave the Active_Hobby unset, and still count the import as finished without error.
8. WHILE the Legacy_Importer is running, THE Path_View SHALL show a loading state and SHALL NOT show the Hobby_Library, so that the learner sees the imported paths on the first load. WHEN the Legacy_Importer finishes or fails, THE Path_View SHALL show the Hobby_Library from the user's Path_Rows at that moment.
9. FOR ALL Legacy_Data, applying the import mapping to the same Legacy_Data twice SHALL produce the same set of Path_Rows and Progress_Rows as applying it once (idempotence property).

### Requirement 9: Tree route with session and per-user rate limit

**User Story:** As the operator, I want generation tied to a user and capped per user, so that paths are saved to the right account and the default key's cost stays bounded.

#### Acceptance Criteria

1. WHEN a request reaches the Tree_Route, THE Tree_Route SHALL read the Access_Token from the `Authorization: Bearer` header and verify it with Supabase before any other check.
2. IF the header is missing, is not a Bearer token, the Access_Token is invalid or expired, or Supabase does not return a verification result within 5 seconds, THEN THE Tree_Route SHALL respond with HTTP status 401 and `{ "error": "unauthorized" }` without checking the body, the Tree_Cache or the Rate_Limiter, and without calling a Provider_Adapter.
3. WHEN the Access_Token belongs to an Anonymous_User, THE Tree_Route SHALL apply the same rate limit, the same caching and the same save behavior as for an Account_User.
4. THE Rate_Limiter SHALL count Billable_Generations per verified user id, with the existing limit of 10 in any 60-minute sliding window, and THE Tree_Route SHALL NOT use the client IP or any user id sent in the request body or query for rate limiting or saving.
5. WHEN a Tree_Route request is answered from the Tree_Cache, or uses a User_Config, THE Rate_Limiter SHALL leave the request out of the count, as in the `ai-skill-tree-generation` spec.
6. FOR ALL sequences of requests from several user ids, THE Rate_Limiter SHALL decide each request from the earlier allowed requests of the same user id only, so that requests from other user ids never change the decision (property).
7. WHEN the Tree_Route has a Skill_Tree for the request, from generation or from the Tree_Cache, THE Tree_Route SHALL save it as the verified user's Path_Row with the request's hobby, Start_Level, the tree, `mascot.set`, the model id (for a Tree_Cache hit, the model id stored with the cached tree) and `archived` false, using the user's Access_Token so that Row Level Security applies.
8. IF the user already has a Path_Row with the same Hobby_Id, THEN THE Tree_Route SHALL replace that row's content, set `archived` to false and delete that path's Progress_Row as one all-or-nothing change, matching Requirement 3.2 of the `local-progress-data` spec.
9. WHEN the save succeeds, THE Tree_Route SHALL respond with HTTP status 200 and `{ "tree": <Skill_Tree>, "model": <model id>, "pathId": <Path_Row id> }`.
10. IF the save fails or does not complete within 10 seconds, THEN THE Tree_Route SHALL respond with HTTP status 502 and `{ "error": "save_failed" }`, leave any existing Path_Row and Progress_Row of that Hobby_Id unchanged, and keep the generated Skill_Tree in the Tree_Cache so that a retry with the same inputs is answered from the Tree_Cache without a Billable_Generation.
11. THE Error_Code type SHALL gain `unauthorized` and `save_failed`, and THE client SHALL show the Friendly_Message "Your session ended. Reload the page and try again." for `unauthorized` and "We built your tree but couldn't save it. Try again." for `save_failed`.
12. THE New_Hobby_Page SHALL send the Access_Token of the current session, as held at the moment of sending, in the `Authorization: Bearer` header of every Tree_Route request.
13. THE Tree_Route SHALL NOT use the Service_Role_Key.
14. IF the New_Hobby_Page has no Access_Token when the user submits a hobby, THEN THE New_Hobby_Page SHALL NOT send a Tree_Route request and SHALL show the Friendly_Message for `unauthorized`.

### Requirement 10: Save your progress prompt

**User Story:** As an anonymous learner, I want a clear nudge to save my progress at the moment it matters, so that I do not lose it by accident.

#### Acceptance Criteria

1. WHILE the Save_Prompt has not been dismissed on this device and the page is not in Demo_Mode, WHEN an Anonymous_User completes a Node, THE Path_View SHALL show the Save_Prompt within 500 ms after the Unlock_Moment card is closed, or within 500 ms after the completion is recorded when no Unlock_Moment card is shown.
2. THE Save_Prompt SHALL show the title "Save your progress", the sentence "Add Google or your email so you can come back to your paths on any device.", the Auth_Dialog options and a "Not now" button.
3. WHEN the user activates "Not now" or closes the Save_Prompt, THE app SHALL close the Save_Prompt within 300 ms, store a dismissed flag in localStorage on this device, and not show the Save_Prompt automatically again on this device, including after a page reload and after later Node completions.
4. WHILE the current user is an Anonymous_User with at least one Path_Row, THE Profile_Page SHALL show a "Save your progress" section with the same Auth_Dialog options as the Save_Prompt, whether or not the dismissed flag is set.
5. WHILE the current user is an Anonymous_User with no Path_Row, THE app SHALL show neither the Save_Prompt nor the "Save your progress" section.
6. WHILE the current user is an Account_User, or the page is in Demo_Mode, THE app SHALL show neither the Save_Prompt nor the "Save your progress" section.
7. THE app SHALL decide whether to show the Save_Prompt after a completion with one pure function that takes four boolean inputs (user is anonymous, page is in Demo_Mode, prompt was dismissed, a Node was just completed) and returns one boolean, and its tests SHALL cover all 16 input combinations, with a true result only when the user is anonymous, the page is not in Demo_Mode, the prompt was not dismissed and a Node was just completed.
8. IF reading or writing the dismissed flag in localStorage fails, THEN THE app SHALL treat the flag as not set when reading, SHALL close the Save_Prompt for the current page session when writing, SHALL keep the completed Node's progress unchanged, and SHALL show no error message to the user.
9. WHEN an Anonymous_User finishes sign-in through the Save_Prompt or the "Save your progress" section, THE app SHALL close the Save_Prompt, SHALL keep all of the user's Path_Rows and progress on the resulting account, and SHALL stop showing the Save_Prompt and the "Save your progress" section.
10. IF sign-in started from the Save_Prompt or the "Save your progress" section fails, THEN THE app SHALL keep the Save_Prompt or section visible, SHALL show an error message indicating that sign-in failed, SHALL keep the user an Anonymous_User with all progress unchanged, and SHALL NOT set the dismissed flag.

### Requirement 11: Profile page, log out and delete account

**User Story:** As a learner, I want to log out and to delete my account with all my data, so that I stay in control of my information.

#### Acceptance Criteria

1. WHILE the app is not in Demo_Mode, THE desktop and mobile navigation SHALL show a Profile item that opens `/profile`, which changes Requirement 5.1 of the `local-progress-data` spec for the Profile item only.
2. THE Profile_Page SHALL show the display name field, the account status ("Guest" for an Anonymous_User, else the email of the Account_User), a link to the Settings_Page, the log-in and save options of Requirement 4 and Requirement 10, the "Log out" button and the "Delete my account" button, each as this requirement states.
3. WHILE the current user is an Account_User, THE Profile_Page SHALL show a "Log out" button.
4. WHILE the current user is an Anonymous_User, THE Profile_Page SHALL show a "Log in" link that opens the Auth_Dialog in `login` mode, and SHALL NOT show a "Log out" button, because ending an anonymous Session strands its data.
5. WHEN the user activates "Log out", THE Auth_Service SHALL end the Session, THE app SHALL remove the Active_Hobby preference, and THE app SHALL open `/`, where a new anonymous Session starts.
6. THE Profile_Page SHALL show a "Delete my account" button to every user, whether Anonymous_User or Account_User.
7. WHEN the user activates "Delete my account", THE Profile_Page SHALL open a confirmation dialog that states that all paths, progress and the profile are deleted for good, with the buttons "Delete my account" and "Cancel", and SHALL send no request unless the user confirms. WHEN the user activates "Cancel", THE Profile_Page SHALL close the dialog and leave the account, the Session and all data unchanged.
8. WHEN the user confirms, THE Profile_Page SHALL send `DELETE /api/account` with the Access_Token in the `Authorization: Bearer` header.
9. WHEN the Delete_Route receives a request with a valid Access_Token, THE Delete_Route SHALL delete the Supabase user with the Service_Role_Key, which removes the user's Profile_Row, Path_Rows and Progress_Rows through delete cascade, and SHALL respond with HTTP status 200 and `{ "ok": true }`.
10. IF the header is missing, is not a Bearer token, or the Access_Token is invalid or expired, THEN THE Delete_Route SHALL respond with HTTP status 401 and `{ "error": "unauthorized" }` and delete nothing.
11. IF the Service_Role_Key is empty, THEN THE Delete_Route SHALL respond with HTTP status 503 and `{ "error": "no_key" }` and delete nothing.
12. IF the Delete_Route responds with an error status, or the request gets no response within 15 seconds, or the request fails because of a network error, THEN THE Profile_Page SHALL keep the confirmation dialog open, show "We couldn't delete your account. Try again." in it, re-enable its buttons, and keep the Session and all local data unchanged.
13. WHEN the deletion succeeds, THE app SHALL end the Session on this device (even if the sign-out call to the Auth_Service fails), remove the Active_Hobby preference and the dismissed flag from localStorage, and open `/`, where a new anonymous Session starts.
14. THE Delete_Route SHALL delete only the user identified by the verified Access_Token and SHALL ignore any user id in the request URL or body.
15. WHILE the delete request is in flight, THE Profile_Page SHALL disable both dialog buttons and show a loading indicator on the "Delete my account" dialog button, so that at most one `DELETE /api/account` request is sent per confirmation.
16. IF ending the Session fails when the user activates "Log out", THEN THE Profile_Page SHALL show "We couldn't log you out. Try again.", stay on `/profile`, and keep the Session and the Active_Hobby preference unchanged.
17. IF the deletion of the Supabase user fails, THEN THE Delete_Route SHALL respond with HTTP status 502 and `{ "error": "delete_failed" }`.

### Requirement 12: Demo mode without an account

**User Story:** As a demo viewer, I want `/path?demo=1` to keep working with no account and no Supabase, so that the demo is always available.

#### Acceptance Criteria

1. WHILE the page is in Demo_Mode, THE app SHALL send 0 Supabase requests, 0 anonymous sign-in requests and 0 Tree_Route requests, from page load until the visitor leaves Demo_Mode.
2. WHILE the page is in Demo_Mode, THE Path_View SHALL read and write the Sample_Tree's Progress only in localStorage under its existing key, and SHALL NOT read, write or delete any account's Progress or other account data.
3. WHILE the page is in Demo_Mode, THE Path_View SHALL show the demo streak, week, hobbies and Fresh samples with the same values and layout as the Demo_Mode page showed before accounts were introduced.
4. WHEN a visitor with a Session opens Demo_Mode and when that visitor leaves Demo_Mode, THE Auth_Service SHALL keep the Session signed in, SHALL NOT refresh, replace or delete its tokens, and SHALL NOT sign the visitor out.
5. IF the Supabase URL or the Supabase anon key is empty, THEN THE Demo_Mode page SHALL render the Sample_Tree without showing an error and without a Supabase request.
6. WHILE the page is in Demo_Mode, THE app SHALL render 0 Save_Prompt elements and 0 Profile items in the navigation.
7. IF localStorage is unavailable or a write to it fails in Demo_Mode, THEN THE Path_View SHALL keep the Sample_Tree's Progress in memory until the page is closed or reloaded, SHALL continue to render the Sample_Tree, and SHALL show no account-related error.

### Requirement 13: Tests and changelog

**User Story:** As a developer, I want the logic tested and the change recorded, so that the feature ships without regressions.

#### Acceptance Criteria

1. WHEN `yarn test` is run, THE automated tests SHALL include at least one passing test for each of the following data-logic items: the Path_Row and Progress_Row mappings (Requirements 5.10 and 6.12), the Save_Queue ordering (6.3), the Legacy_Importer mapping with timestamp assignment (8.3), the Legacy_Importer idempotence when run twice on the same input (8.9), and the Streak and Week derived from Progress_Rows (6.8).
2. WHEN `yarn test` is run, THE automated tests SHALL include at least one passing success case and at least one passing rejection case for each of the following: the Tree_Route handler with mocked token verification, path saving and Rate_Limiter (9.2 to 9.10), the Rate_Limiter keyed by user id (9.6), the Bearer header parsing, and the Delete_Route handler with a mocked admin client (11.9 to 11.11, 11.14, 11.17).
3. WHEN `yarn test` is run, THE automated tests SHALL include at least one passing test for the Save_Prompt decision function (10.7) and at least one passing test for each Supabase auth error case that maps to a Friendly_Message (4.5, 4.9, 4.13).
4. THE automated tests SHALL make zero network calls to a real Supabase project and zero network calls to a real LLM provider, and SHALL contain zero Vue component tests.
5. THE Setup_Guide checklist of Requirements 2.10 and 2.12 SHALL be the only verification for Row Level Security, and THE automated tests SHALL contain no Row Level Security tests, since that behavior needs a live Supabase project.
6. WHEN the feature is finished, THE existing tests from earlier specs SHALL pass with zero failures after the Tree_Route handler tests are updated to use a user id in place of an IP, and `yarn typecheck` SHALL complete with zero errors.
7. WHEN the feature is finished, THE CHANGELOG.md SHALL gain at least one entry under "## [Unreleased]", written as one line per change in the Added, Changed, Fixed or Removed group, each ending with "(spec: accounts-cloud-save)", and THE CHANGELOG.md SHALL leave all existing entries unchanged.
