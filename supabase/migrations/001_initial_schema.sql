create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'admin')),
  rating integer not null default 1000,
  skill_level text not null default 'Beginner' check (skill_level in ('Beginner', 'Intermediate', 'Advanced', 'Pro')),
  bio text,
  phone text,
  status text not null default 'active' check (status in ('active', 'banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  legs_played integer not null default 0,
  legs_won integer not null default 0,
  legs_lost integer not null default 0,
  total_scored_points integer not null default 0,
  total_darts integer not null default 0,
  average_per_3_darts numeric(8, 2) not null default 0,
  highest_turn_score integer not null default 0,
  count_180 integer not null default 0,
  count_100_plus integer not null default 0,
  count_140_plus integer not null default 0,
  current_rating integer not null default 1000,
  last_match_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null,
  name text not null,
  description text,
  location text,
  registration_start_at timestamptz not null,
  registration_end_at timestamptz not null,
  tournament_start_at timestamptz not null,
  max_participants integer not null default 32 check (max_participants > 1),
  tournament_type text not null default 'doubles' check (tournament_type in ('individual', 'doubles', 'team')),
  team_size integer not null default 2 check (team_size >= 1),
  format text not null default 'round_robin' check (format in ('round_robin', 'single_elimination', 'double_elimination')),
  dart_game integer not null default 501 check (dart_game in (501, 701)),
  best_of integer not null default 3 check (best_of in (3, 5, 7)),
  auto_grouping_enabled boolean not null default true,
  balanced_grouping_enabled boolean not null default true,
  manual_result_allowed boolean not null default true,
  status text not null default 'draft' check (status in ('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered', 'confirmed', 'cancelled', 'removed')),
  rating_snapshot integer not null default 1000,
  skill_level_snapshot text not null default 'Beginner',
  preferred_partner_user_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  total_rating integer not null default 0,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating_snapshot integer not null default 1000,
  skill_level_snapshot text not null default 'Beginner',
  role text not null default 'member' check (role in ('captain', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table public.tournament_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  participant_type text not null check (participant_type in ('user', 'team')),
  display_name text not null,
  rating_snapshot integer not null default 1000,
  skill_level_snapshot text,
  seed integer,
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_subject_check check (
    (participant_type = 'user' and user_id is not null and team_id is null)
    or
    (participant_type = 'team' and team_id is not null)
  )
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  group_index integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, name)
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  participant_id uuid not null references public.tournament_participants(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, participant_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id uuid references public.groups(id) on delete set null,
  stage text not null check (stage in ('group', 'knockout')),
  round_number integer not null default 1,
  match_number integer not null default 1,
  participant_a_id uuid references public.tournament_participants(id) on delete set null,
  participant_b_id uuid references public.tournament_participants(id) on delete set null,
  winner_participant_id uuid references public.tournament_participants(id) on delete set null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'pending_confirmation', 'disputed', 'completed', 'bye')),
  score_a integer not null default 0,
  score_b integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  next_match_id uuid references public.matches(id) on delete set null,
  next_match_slot text check (next_match_slot in ('A', 'B')),
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_legs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  leg_number integer not null,
  starting_score integer not null default 501 check (starting_score in (501, 701)),
  winner_participant_id uuid references public.tournament_participants(id) on delete set null,
  checkout_score integer,
  participant_a_avg numeric(8, 2),
  participant_b_avg numeric(8, 2),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_turns (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  leg_id uuid references public.match_legs(id) on delete cascade,
  participant_id uuid not null references public.tournament_participants(id) on delete cascade,
  turn_number integer not null,
  score integer not null check (score between 0 and 180),
  remaining_before integer not null,
  remaining_after integer not null,
  is_bust boolean not null default false,
  is_checkout boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.match_result_confirmations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  required_confirm_by uuid not null references public.profiles(id) on delete cascade,
  proposed_winner_participant_id uuid references public.tournament_participants(id) on delete set null,
  proposed_score_a integer not null default 0,
  proposed_score_b integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'disputed', 'admin_resolved')),
  reject_reason text,
  admin_resolved_by uuid references public.profiles(id) on delete set null,
  admin_note text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rating_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tournament_id uuid references public.tournaments(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  rating_before integer not null,
  rating_after integer not null,
  delta integer not null,
  reason text not null check (reason in ('match_win', 'match_loss', 'admin_adjust')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles(role);
create index tournaments_status_idx on public.tournaments(status);
create index tournament_registrations_tournament_idx on public.tournament_registrations(tournament_id);
create index tournament_participants_tournament_idx on public.tournament_participants(tournament_id);
create index teams_tournament_idx on public.teams(tournament_id);
create index team_members_team_idx on public.team_members(team_id);
create index groups_tournament_idx on public.groups(tournament_id);
create index matches_tournament_idx on public.matches(tournament_id);
create index matches_group_idx on public.matches(group_id);
create index match_turns_match_idx on public.match_turns(match_id);
create index rating_logs_user_idx on public.rating_logs(user_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger user_stats_set_updated_at
before update on public.user_stats
for each row execute function public.set_updated_at();

create trigger tournaments_set_updated_at
before update on public.tournaments
for each row execute function public.set_updated_at();

create trigger registrations_set_updated_at
before update on public.tournament_registrations
for each row execute function public.set_updated_at();

create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

create trigger team_members_set_updated_at
before update on public.team_members
for each row execute function public.set_updated_at();

create trigger participants_set_updated_at
before update on public.tournament_participants
for each row execute function public.set_updated_at();

create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger group_members_set_updated_at
before update on public.group_members
for each row execute function public.set_updated_at();

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

create trigger match_legs_set_updated_at
before update on public.match_legs
for each row execute function public.set_updated_at();

create trigger match_turns_set_updated_at
before update on public.match_turns
for each row execute function public.set_updated_at();

create trigger confirmations_set_updated_at
before update on public.match_result_confirmations
for each row execute function public.set_updated_at();

create trigger rating_logs_set_updated_at
before update on public.rating_logs
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_stats (user_id)
  values (new.id)
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
    new.status = old.status;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_admin_fields
before update on public.profiles
for each row execute function public.protect_profile_admin_fields();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where profiles.id = user_id
      and profiles.role = 'admin'
      and profiles.status = 'active'
  );
$$;

create or replace function public.is_tournament_member(check_user_id uuid, check_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournament_participants tp
    left join public.team_members tm on tm.team_id = tp.team_id
    where tp.tournament_id = check_tournament_id
      and tp.status = 'active'
      and (
        tp.user_id = check_user_id
        or tm.user_id = check_user_id
      )
  );
$$;

create or replace function public.is_match_member(check_user_id uuid, check_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.matches m
    join public.tournament_participants tp
      on tp.id in (m.participant_a_id, m.participant_b_id)
    left join public.team_members tm on tm.team_id = tp.team_id
    where m.id = check_match_id
      and (
        tp.user_id = check_user_id
        or tm.user_id = check_user_id
      )
  );
$$;

create or replace function public.upsert_user_match_stats(
  p_user_id uuid,
  p_won boolean,
  p_legs_won integer,
  p_legs_lost integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_rating integer;
begin
  select rating into profile_rating from public.profiles where id = p_user_id;

  insert into public.user_stats (
    user_id,
    matches_played,
    wins,
    losses,
    legs_played,
    legs_won,
    legs_lost,
    current_rating,
    last_match_at
  )
  values (
    p_user_id,
    1,
    case when p_won then 1 else 0 end,
    case when p_won then 0 else 1 end,
    coalesce(p_legs_won, 0) + coalesce(p_legs_lost, 0),
    coalesce(p_legs_won, 0),
    coalesce(p_legs_lost, 0),
    coalesce(profile_rating, 1000),
    now()
  )
  on conflict (user_id) do update set
    matches_played = public.user_stats.matches_played + 1,
    wins = public.user_stats.wins + case when p_won then 1 else 0 end,
    losses = public.user_stats.losses + case when p_won then 0 else 1 end,
    legs_played = public.user_stats.legs_played + coalesce(p_legs_won, 0) + coalesce(p_legs_lost, 0),
    legs_won = public.user_stats.legs_won + coalesce(p_legs_won, 0),
    legs_lost = public.user_stats.legs_lost + coalesce(p_legs_lost, 0),
    current_rating = coalesce(profile_rating, public.user_stats.current_rating),
    last_match_at = now(),
    updated_at = now();
end;
$$;

alter table public.profiles enable row level security;
alter table public.user_stats enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.tournament_participants enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.matches enable row level security;
alter table public.match_legs enable row level security;
alter table public.match_turns enable row level security;
alter table public.match_result_confirmations enable row level security;
alter table public.rating_logs enable row level security;

create policy "profiles read own or admin" on public.profiles
for select using (auth.uid() = id or public.is_admin());

create policy "profiles update own basic or admin" on public.profiles
for update using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

create policy "stats read own or admin" on public.user_stats
for select using (auth.uid() = user_id or public.is_admin());

create policy "stats admin write" on public.user_stats
for all using (public.is_admin()) with check (public.is_admin());

create policy "tournaments public read" on public.tournaments
for select using (status <> 'draft' or created_by = auth.uid() or public.is_admin());

create policy "tournaments admin write" on public.tournaments
for all using (public.is_admin()) with check (public.is_admin());

create policy "registrations read own or admin" on public.tournament_registrations
for select using (user_id = auth.uid() or public.is_admin());

create policy "registrations create own while open" on public.tournament_registrations
for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.tournaments t
    where t.id = tournament_id
      and t.status = 'registration_open'
      and now() between t.registration_start_at and t.registration_end_at
  )
);

create policy "registrations update own cancellable or admin" on public.tournament_registrations
for update using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "registrations admin delete" on public.tournament_registrations
for delete using (public.is_admin());

create policy "team data read visible tournaments" on public.teams
for select using (
  public.is_admin()
  or exists (
    select 1 from public.tournaments t
    where t.id = tournament_id and t.status <> 'draft'
  )
);

create policy "team data admin write" on public.teams
for all using (public.is_admin()) with check (public.is_admin());

create policy "team members read visible tournaments" on public.team_members
for select using (
  public.is_admin()
  or exists (
    select 1
    from public.teams team
    join public.tournaments t on t.id = team.tournament_id
    where team.id = team_id and t.status <> 'draft'
  )
);

create policy "team members admin write" on public.team_members
for all using (public.is_admin()) with check (public.is_admin());

create policy "participants read visible tournaments" on public.tournament_participants
for select using (
  public.is_admin()
  or exists (
    select 1 from public.tournaments t
    where t.id = tournament_id and t.status <> 'draft'
  )
);

create policy "participants admin write" on public.tournament_participants
for all using (public.is_admin()) with check (public.is_admin());

create policy "groups read visible tournaments" on public.groups
for select using (
  public.is_admin()
  or exists (
    select 1 from public.tournaments t
    where t.id = tournament_id and t.status <> 'draft'
  )
);

create policy "groups admin write" on public.groups
for all using (public.is_admin()) with check (public.is_admin());

create policy "group members read visible tournaments" on public.group_members
for select using (
  public.is_admin()
  or exists (
    select 1
    from public.groups g
    join public.tournaments t on t.id = g.tournament_id
    where g.id = group_id and t.status <> 'draft'
  )
);

create policy "group members admin write" on public.group_members
for all using (public.is_admin()) with check (public.is_admin());

create policy "matches read visible tournaments" on public.matches
for select using (
  public.is_admin()
  or public.is_tournament_member(auth.uid(), tournament_id)
  or exists (
    select 1 from public.tournaments t
    where t.id = tournament_id and t.status <> 'draft'
  )
);

create policy "matches admin write" on public.matches
for all using (public.is_admin()) with check (public.is_admin());

create policy "legs read match members or admin" on public.match_legs
for select using (
  public.is_admin()
  or exists (
    select 1 from public.matches m
    where m.id = match_id
      and (
        public.is_match_member(auth.uid(), m.id)
        or exists (
          select 1 from public.tournaments t
          where t.id = m.tournament_id and t.status <> 'draft'
        )
      )
  )
);

create policy "legs admin write" on public.match_legs
for all using (public.is_admin()) with check (public.is_admin());

create policy "turns read match members or admin" on public.match_turns
for select using (
  public.is_admin()
  or public.is_match_member(auth.uid(), match_id)
);

create policy "turns insert match members" on public.match_turns
for insert with check (
  public.is_admin()
  or public.is_match_member(auth.uid(), match_id)
);

create policy "turns admin update delete" on public.match_turns
for update using (public.is_admin()) with check (public.is_admin());

create policy "confirmations read involved or admin" on public.match_result_confirmations
for select using (
  submitted_by = auth.uid()
  or required_confirm_by = auth.uid()
  or public.is_admin()
);

create policy "confirmations create involved" on public.match_result_confirmations
for insert with check (
  submitted_by = auth.uid()
  and public.is_match_member(auth.uid(), match_id)
);

create policy "confirmations update confirmer or admin" on public.match_result_confirmations
for update using (
  required_confirm_by = auth.uid()
  or public.is_admin()
) with check (
  required_confirm_by = auth.uid()
  or public.is_admin()
);

create policy "rating logs read own or admin" on public.rating_logs
for select using (user_id = auth.uid() or public.is_admin());

create policy "rating logs admin write" on public.rating_logs
for all using (public.is_admin()) with check (public.is_admin());
