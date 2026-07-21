create or replace function public.generate_profile_uid()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (
      select 1 from public.profiles
      where profiles.uid = candidate
    );
  end loop;

  return candidate;
end;
$$;

alter table public.profiles
  add column if not exists uid text;

do $$
declare
  profile_row record;
begin
  for profile_row in
    select id
    from public.profiles
    where uid is null or uid !~ '^[0-9]{6}$'
  loop
    update public.profiles
    set uid = public.generate_profile_uid()
    where id = profile_row.id;
  end loop;
end;
$$;

alter table public.profiles
  alter column uid set default public.generate_profile_uid(),
  alter column uid set not null,
  drop constraint if exists profiles_uid_format_check,
  add constraint profiles_uid_format_check check (uid ~ '^[0-9]{6}$');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_uid_key'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles add constraint profiles_uid_key unique (uid);
  end if;
end;
$$;

create index if not exists profiles_uid_idx on public.profiles(uid);

create or replace function public.protect_profile_uid()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.uid is not null and new.uid is distinct from old.uid then
    new.uid = old.uid;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_uid on public.profiles;
create trigger profiles_protect_uid
before update on public.profiles
for each row execute function public.protect_profile_uid();

create table if not exists public.saved_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar_url text,
  captain_user_id uuid not null references public.profiles(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teams
  add column if not exists saved_team_id uuid references public.saved_teams(id) on delete set null,
  add column if not exists captain_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists avatar_url text;

update public.teams team
set captain_user_id = captain.user_id
from (
  select distinct on (team_id)
    team_id,
    user_id
  from public.team_members
  order by team_id, case when role = 'captain' then 0 else 1 end, created_at
) captain
where team.id = captain.team_id
  and team.captain_user_id is null;

create index if not exists saved_teams_captain_idx on public.saved_teams(captain_user_id);
create index if not exists saved_teams_status_idx on public.saved_teams(status);
create index if not exists teams_saved_team_idx on public.teams(saved_team_id);
create index if not exists teams_captain_idx on public.teams(captain_user_id);

drop trigger if exists saved_teams_set_updated_at on public.saved_teams;
create trigger saved_teams_set_updated_at
before update on public.saved_teams
for each row execute function public.set_updated_at();

alter table public.saved_teams enable row level security;

drop policy if exists "saved teams read captain or admin" on public.saved_teams;
create policy "saved teams read captain or admin"
on public.saved_teams
for select using (
  public.is_admin()
  or captain_user_id = auth.uid()
  or created_by = auth.uid()
);

drop policy if exists "saved teams captain create" on public.saved_teams;
create policy "saved teams captain create"
on public.saved_teams
for insert with check (
  public.is_admin()
  or captain_user_id = auth.uid()
);

drop policy if exists "saved teams captain update profile" on public.saved_teams;
create policy "saved teams captain update profile"
on public.saved_teams
for update using (
  public.is_admin()
  or captain_user_id = auth.uid()
) with check (
  public.is_admin()
  or captain_user_id = auth.uid()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    uid,
    display_name,
    rating,
    skill_level,
    tournament_rating,
    casual_rating,
    soft_rating,
    tournament_skill_level,
    casual_skill_level,
    soft_skill_level
  )
  values (
    new.id,
    public.generate_profile_uid(),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    1000,
    'Beginner',
    1000,
    1000,
    1000,
    'Beginner',
    'Beginner',
    'Beginner'
  )
  on conflict (id) do nothing;

  insert into public.user_stats (user_id, current_rating)
  values (new.id, 1000)
  on conflict (user_id) do nothing;

  insert into public.general_user_stats (user_id, current_rating)
  values (new.id, 1000)
  on conflict (user_id) do nothing;

  insert into public.soft_user_stats (user_id, current_rating)
  values (new.id, 1000)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not public.is_admin(auth.uid()) then
    new.role = old.role;
    new.rating = old.rating;
    new.skill_level = old.skill_level;
    new.tournament_rating = old.tournament_rating;
    new.casual_rating = old.casual_rating;
    new.soft_rating = old.soft_rating;
    new.tournament_skill_level = old.tournament_skill_level;
    new.casual_skill_level = old.casual_skill_level;
    new.soft_skill_level = old.soft_skill_level;
    new.status = old.status;
  end if;
  new.uid = old.uid;
  return new;
end;
$$;
