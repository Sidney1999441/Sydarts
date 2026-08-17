create table if not exists public.tournament_weekly_stars (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  week_start date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_weekly_stars_unique_week unique (tournament_id, week_start),
  constraint tournament_weekly_stars_reason_length check (char_length(reason) <= 240),
  constraint tournament_weekly_stars_monday check (extract(isodow from week_start) = 1)
);

create index if not exists tournament_weekly_stars_user_id_idx
on public.tournament_weekly_stars(user_id);

create index if not exists tournament_weekly_stars_created_by_idx
on public.tournament_weekly_stars(created_by)
where created_by is not null;

drop trigger if exists tournament_weekly_stars_set_updated_at on public.tournament_weekly_stars;
create trigger tournament_weekly_stars_set_updated_at
before update on public.tournament_weekly_stars
for each row execute function public.set_updated_at();

alter table public.tournament_weekly_stars enable row level security;

drop policy if exists "weekly stars read visible tournaments" on public.tournament_weekly_stars;
create policy "weekly stars read visible tournaments" on public.tournament_weekly_stars
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.tournaments tournament
    where tournament.id = tournament_id
      and tournament.status <> 'draft'
  )
);

revoke all on table public.tournament_weekly_stars from public, anon, authenticated;
grant select on table public.tournament_weekly_stars to anon, authenticated;
grant all on table public.tournament_weekly_stars to service_role;

comment on table public.tournament_weekly_stars is
  'Administrator overrides for automatically calculated weekly tournament stars.';
comment on column public.tournament_weekly_stars.week_start is
  'Monday of the Shanghai calendar week represented by this override.';
