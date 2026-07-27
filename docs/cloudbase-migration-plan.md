# CODL CloudBase Migration Plan

This plan moves CODL from Supabase-managed services to a Tencent Cloud native
production stack without breaking the current league workflow during migration.

## Target Stack

- CloudBase HTTP Function or CloudBase container hosting for the Next.js app.
- CloudBase Functions for mobile/miniprogram API entry points.
- Tencent Cloud managed PostgreSQL for relational league data.
- Tencent COS or CloudBase Storage for avatars, team logos, and exports.
- CloudBase identity/WeChat identity mapped into CODL profiles.

PostgreSQL stays as the primary database because the current system depends on
Postgres-friendly concepts: UUIDs, JSON payloads, transactional settlement,
stored procedures, triggers, and precise replay/recalculation tables.

## Migration Rules

1. Keep `CODL_BACKEND_PROVIDER=supabase` until a Tencent implementation passes
   the same closed-loop tests.
2. Do not let browser code call Tencent database credentials directly.
3. Use CloudBase/Next.js server code as the only privileged backend boundary.
4. Keep user-facing IDs stable. Supabase Auth IDs should become profile IDs or
   legacy identity IDs, not be discarded.
5. Move file URLs behind CODL-owned routes before moving physical files.

## Phases

### Phase 1: Backend Boundary

- Add backend provider detection and readiness checks.
- Add `/api/system/backend` for deployment diagnostics.
- Keep all Supabase behavior active.
- Proxy avatar reads through `/api/storage/avatars/*` so the browser no longer
  needs to know where the file is stored.

### Phase 2: Tencent PostgreSQL Schema

- Generate `database/tencent-postgres/schema.sql` from Supabase migrations.
- Remove Supabase-only dependencies:
  - `auth.users`
  - `auth.uid()`
  - Supabase RLS policies
  - `storage.*`
  - service-role assumptions
- Add explicit application tables:
  - `auth_identities`
  - `sessions`
  - `audit_logs`
  - `file_objects`

### Phase 3: Auth Migration

- Implement CloudBase/WeChat login.
- Map every CloudBase UID or WeChat openid to a CODL profile.
- Keep email/password login only as an admin fallback if needed.
- Move role checks from Supabase JWT/RLS into server-side guards.

### Phase 4: Storage Migration

- Copy `avatars` objects from Supabase Storage to COS or CloudBase Storage.
- Keep `/api/storage/avatars/*` stable while changing the implementation behind it.
- Store object keys in the database instead of provider-specific public URLs.

### Phase 5: Data Migration

- Export Supabase public tables and auth identities.
- Import into Tencent PostgreSQL with identity mapping.
- Run deterministic row-count and checksum checks for core tables.
- Freeze old writes before the final import.

### Phase 6: Settlement Migration

- Move official match settlement from Supabase RPC into a CloudBase service
  transaction against Tencent PostgreSQL.
- Preserve idempotency keys, settlement markers, stat baselines, and stat events.
- Compare old and new settlement outputs for the Dongkang mixed league fixture.

### Phase 7: Cutover

- Set `CODL_BACKEND_PROVIDER=tencent`.
- Run:
  - `npm run typecheck`
  - `npm run test`
  - closed-loop league smoke test against Tencent PostgreSQL
- Switch production domain to CloudBase.
- Keep Supabase read-only for rollback until the first official event completes.

## Current First Cut

The first committed cut is intentionally small:

- `lib/backend/provider.ts`
- `/api/system/backend`
- `/api/storage/avatars/*`
- avatar URL normalization helpers
- Tencent/CloudBase environment placeholders

This gives the project a stable migration seam while preserving the current
Supabase-backed app behavior.
