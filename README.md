# SYDARTS Darts Tournament MVP

Team-first darts tournament management and scoring app built with Next.js,
TypeScript, Tailwind CSS, Supabase Auth, Supabase PostgreSQL, and Supabase
Storage.

## Current Status

This repository is in a usable MVP state as of 2026-07-22. It supports end to
end tournament setup, registration, team generation, schedule generation, mixed
soft/hard tournament templates, hard dart scoring, manual soft dart result
entry, player profiles, ratings, stats, avatars, site theme configuration, and
idempotent atomic result settlement.

The app is now suitable for running a highly customized team league where soft
dart and hard dart matches can be alternated for the same pair of teams. Soft
dart legs can be recorded as 01 games, Mickey / Cricket, HALF-IT, or HIGH SCORE,
while hard dart team legs record the exact thrower for every turn so individual
data remains attributable inside team matches.

The current branch still contains a large uncommitted feature set. Before heavy
new development, create a branch and commit the current usable baseline.

## Core Model

Every match participant is represented by `tournament_participants`.

For individual events, a participant points to one profile. For doubles or team
events, a participant points to a tournament team. Grouping, scheduling,
standings, scoring, result confirmation, and rating updates then follow the same
participant path regardless of event type.

## Current Features

- Supabase email/password authentication.
- Profile creation with six digit player UID.
- Admin and regular user roles.
- Admin tournament creation and editing.
- Tournament formats currently open for use:
  - group round robin
  - single elimination
- Tournament types:
  - individual
  - doubles
  - team
- Hard dart modes:
  - 301
  - 501
  - 701
- Soft dart modes:
  - 301
  - 501
  - 701
  - Mickey / Cricket
  - HALF-IT
  - HIGH SCORE
  - snow 501 and snow 701 for two player doubles teams
- Mixed soft/hard tournaments by round or by custom leg template.
- Mixed round-robin schedules can expand each pair into one soft match and one
  hard dart match, matching a soft/hard double round-robin league.
- Standard BO3, BO5, BO7 matches.
- Custom per-leg templates, including singles/doubles/team participation modes.
- Registration with optional preferred partner UID.
- Admin add/remove/confirm registrations.
- Automatic balanced team generation.
- Long-term saved teams that can be reused for future tournaments.
- Tournament team editing, captain assignment, member changes, and team avatars.
- Group generation and schedule generation.
- Knockout winner advancement for single elimination brackets.
- Touch-first hard dart scorer with:
  - keypad input
  - quick scores
  - checkout dart count
  - team thrower selection
  - automatic team thrower rotation
  - undo
  - reset
  - leg history
  - per-leg lineup selection for singles legs
  - per-turn individual throw tracking for doubles and team legs
- Manual result entry for tournament matches.
- Manual soft dart 01 stats, including per-player averages and checkout fields.
- Manual Mickey / Cricket stats, including MPR, total marks, 5/6/7 mark counts,
  hat tricks, and white horses.
- Opponent confirmation flow for non-admin manual results.
- Admin result override.
- Casual scorer for practice/sparring matches.
- Linked casual opponents can confirm before their stats are updated.
- Official scorer, manual result, admin result, and casual result submissions
  carry submission IDs so repeated clicks or retries do not create duplicate
  settlements.
- Official tournament result settlement runs through one database RPC
  transaction, covering match completion, confirmation acceptance, legs, turns,
  rating logs, stat events, aggregate stat refresh, settlement markers, and
  knockout advancement.
- Admin result correction can recalculate matches settled through the atomic
  settlement ledger by rolling back that match's stat events and rating deltas,
  then replaying the corrected payload.
- Separate rating/stat tracks:
  - tournament
  - general/casual
  - soft dart
- Player profile dashboard with ratings, level calculation, match history, and
  pending confirmations.
- Player profile pages separate team participant results from exact individual
  turn data when official scorer turns include a thrower user ID.
- Site theme management for platform name, logo URL, and core colors.
- Avatar upload with client-side crop/compress to WebP.
- Supabase keep-alive workflow and schema check script.
- Dongkang office league closed-loop smoke test script for creating mock
  accounts, teams, a mixed league schedule, RPC settlements, and a JSON evidence
  report.

## Known Limits

- Double elimination is intentionally disabled in the UI and rejected by server
  validation until its bracket algorithm and advancement rules are implemented.
- Soft dart machine ingestion is reserved. The current workflow is manual soft
  dart result entry plus optional opponent confirmation.
- Soft dart manual entry can store detailed individual Mickey / Cricket numbers,
  but it does not yet offer a live Cricket scoring board.
- A/B player tiering can be represented by ratings and manual team construction,
  but there is no first-class tier draw workflow yet.
- The Dongkang playoff format uses two-match soft+hard aggregate ties. Current
  bracket automation still advances by a single match, so postseason aggregate
  ties need a dedicated model before production use.
- Manual soft dart entry can store player totals and leg winners, but it does not
  yet provide an optimized score-sheet flow that mirrors the soft dart machine
  screens for 501, Mickey / Cricket, HALF-IT, and HIGH SCORE.
- Official hard dart team scoring records every thrower, but historical matches
  submitted before this field existed still fall back to participant-level stats.
- Result updates after a match is already completed can recalculate matches
  settled by migration 011 or later. Legacy completed matches without settlement
  stat events are protected from unsafe automatic recalculation.
- Full chronological replay across every later match is still a separate admin
  maintenance tool. The current correction path is exact for the selected match's
  ledgered stat events and applies rating delta compensation for that match.
- The automated tests currently focus on algorithms. Server Action and
  browser-level workflow coverage is still needed.

## Setup

1. Create a Supabase project.
2. Run every SQL file in `supabase/migrations` in numeric order.
3. Copy `.env.example` to `.env.local`.
4. Fill these variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

5. Install dependencies:

```bash
npm install
```

6. Start the app:

```bash
npm run dev
```

## First Admin

After the first user signs up, promote that profile in Supabase:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_UUID';
```

## Main Workflows

Admin tournament workflow:

1. Create a tournament in `/admin/tournaments/new`.
2. Set registration dates, tournament type, team size, dart mode, game mode, and
   match template.
3. Open registration from `/admin/tournaments`.
4. Manage registrations in `/admin/tournaments/[id]/participants`.
5. Generate teams/participants.
6. Generate groups and schedule in `/admin/tournaments/[id]/schedule`.
7. Monitor or correct results in `/admin/tournaments/[id]/results`.

Player workflow:

1. Register or sign in.
2. Open `/tournaments`.
3. Register for an open tournament, optionally with a preferred partner UID.
4. Use `/scorer` for assigned hard dart matches.
5. Use the tournament detail page for manual soft dart or manual tournament
   result entry.
6. Confirm pending results from `/profile`.
7. Review history, stats, and saved teams from `/profile`.

Theme and identity workflow:

1. Admin opens `/admin/theme`.
2. Update platform name, logo URL, and core colors.
3. Users and admins upload avatars from profile/team management surfaces.

## Scripts

- `npm run dev` starts the local Next.js server.
- `npm run build` builds the app.
- `npm run typecheck` runs TypeScript validation.
- `npm run test` runs algorithm tests.
- `npm run test:dongkang` creates a full Dongkang-style test league in Supabase
  using service-role credentials and writes a report to
  `tmp/dongkang-league-test-report-<batch>.json`.
- `npm run db:wake` sends a low-cost Supabase REST request so an idle project can
  wake up.
- `npm run db:test` wakes Supabase and checks the expected database tables and
  key post-migration columns. With `SUPABASE_SERVICE_ROLE_KEY`, it also checks
  the `avatars` storage bucket.

## Verification Baseline

Use these before handing off a usable build:

```bash
npm run typecheck
npm run test
npm run build
npm run db:test
```

## Supabase Notes

Migration `009_production_readiness.sql` adds explicit Data API grants for the
known app tables, unique indexes that reduce duplicate result settlement and
submission-confirmation risk, and tighter direct execute permissions for
stats-writing RPC functions.

Migration `010_individual_turns_and_mickey_stats.sql` adds `match_turns.user_id`
for exact team throw attribution, adds Mickey / Cricket stat columns to
`soft_user_stats`, and updates the soft-stat upsert RPC signature.

Migration `011_atomic_match_settlement.sql` adds the atomic
`settle_tournament_match` RPC plus settlement/stat-event ledgers. New official
match completions no longer perform multi-step application-side writes.

Migration `012_internal_settlement_table_policies.sql` adds explicit
service-role-only RLS policies for the internal settlement ledger tables.

Migration `013_dongkang_soft_variants.sql` allows Dongkang soft dart variants:
soft 701, HALF-IT, and HIGH SCORE.

Apply migrations through the Supabase SQL editor or Supabase CLI in numeric
order. Review permission changes before applying them to production.

## Dongkang Closed-Loop Test

The batch `20260721165433` was executed against Supabase project
`mlcheqzzaunzllvwsdoq` on 2026-07-22. The generated tournament was
`DK Rule Closed Loop 20260721165433` with ID
`4b6f8e77-1a77-4c45-94de-a09e03614848`.

The test created 16 mock accounts, paired them into 8 doubles teams with one
A-tier and one B-tier player per team, generated 56 regular-season matches, and
settled all 56 through the `settle_tournament_match` RPC. The generated evidence
report is `tmp/dongkang-league-test-report-20260721165433.json`.

Closed-loop checks passed:

- 56/56 soft+hard round-robin matches generated and completed.
- Every team pair received one soft dart match and one hard dart match.
- 56 settlement ledger rows written.
- 773/773 hard dart turns include a `user_id` for exact thrower attribution.
- 177 hard dart legs and 178 soft dart legs were written.
- 336 personal stat events were written, including 112 soft events and 112 hard
  tournament events.
- 28/28 soft dart matches were settled through manual-entry payloads.
- All 16 mock users received soft stat rows, with 8 hat tricks and 2992 marks.
- All 16 mock users received hard stat rows, with highest-checkout award data.

The test found product gaps, not blocking defects:

- A/B tiering needs an admin draw workflow instead of relying on manual team
  setup.
- Dongkang postseason aggregate ties need first-class soft+hard two-match
  bracket support.
- Soft dart manual entry should be redesigned into a faster machine-score-sheet
  workflow for match day.

## Supabase Wake Schedule

`.github/workflows/wake-supabase.yml` runs every three days and can also be
started manually from GitHub Actions.

Add these repository secrets in GitHub:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Do not add `SUPABASE_SERVICE_ROLE_KEY` to the wake workflow. It is only needed
locally for stricter schema checks.

When using `next dev`, avoid running `npm run build` against the same `.next`
directory while the dev server is still open. If the UI loses styling or returns
stale chunks, stop the server, delete `.next`, and start `npm run dev` again.

## Next Plan

1. Close Dongkang production gaps:
   - A/B tier import and draw workflow
   - soft+hard aggregate playoff ties
   - one-leg hard 501 doubles tiebreaker tool
   - printable/exportable match sheets

2. Add workflow tests:
   - tournament creation
   - registration
   - team generation
   - schedule generation
   - hard dart scoring
   - manual soft dart entry
   - opponent confirmation
   - profile stat update

3. Improve soft dart operations:
   - live Mickey / Cricket scoring surface
   - optional machine/import adapter for soft dart results
   - bulk stat review before final settlement

4. Finish tournament operations:
   - better schedule time assignment
   - bracket visualization
   - completed tournament archive state

5. Build admin maintenance tools:
   - chronological full-rating replay
   - legacy match backfill into settlement stat events
   - one-click match audit report

6. Implement double elimination:
   - bracket generator
   - losers bracket advancement
   - grand final/reset logic
   - tests for bye and uneven participant counts

7. Design soft dart provider ingestion:
   - provider adapter interface
   - signed webhook verification
   - player UID/provider ID mapping
   - replay protection
   - manual review queue for ambiguous external results
