# Small Darts Tournament MVP

Team-first darts tournament management MVP built with Next.js, TypeScript, Tailwind CSS, Supabase Auth, and Supabase PostgreSQL.

## Core model

The system treats every match participant as a `tournament_participant`. For individual events, a participant points to one user. For doubles or team events, a participant points to a team. This keeps grouping, scheduling, scoring, standings, and rating updates on one path.

## Setup

1. Create a Supabase project.
2. Run the migration files in order in the Supabase SQL editor or through the Supabase CLI:
   `001_initial_schema.sql`, `002_runtime_fixes.sql`, and `003_casual_scorer_and_split_ratings.sql`.
   The third migration adds casual sparring matches, split tournament/general ratings, and checkout dart counts.
3. Copy `.env.example` to `.env.local` and fill the Supabase URL, anon key, and service role key.
4. Install dependencies with `npm install`.
5. Start the app with `npm run dev`.

## First admin

After the first user signs up, promote that profile in Supabase:

```sql
update public.profiles
set role = 'admin'
where id = 'USER_UUID';
```

## Scripts

- `npm run dev` starts the local Next.js server.
- `npm run build` builds the app.
- `npm run typecheck` runs TypeScript validation.
- `npm run test` runs algorithm tests.

When using `next dev`, avoid running `npm run build` against the same `.next` directory while the dev server is still open. If the UI loses styling or returns stale chunks, stop the server, delete `.next`, and start `npm run dev` again.
