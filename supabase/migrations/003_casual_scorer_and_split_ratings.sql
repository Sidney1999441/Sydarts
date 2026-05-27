alter table public.profiles
  add column if not exists tournament_rating integer not null default 1000,
  add column if not exists casual_rating integer not null default 1000,
  add column if not exists tournament_skill_level text not null default 'Beginner',
  add column if not exists casual_skill_level text not null default 'Beginner';

update public.profiles
set
  tournament_rating = coalesce(tournament_rating, rating, 1000),
  casual_rating = coalesce(casual_rating, rating, 1000),
  tournament_skill_level = coalesce(tournament_skill_level, skill_level, 'Beginner'),
  casual_skill_level = coalesce(casual_skill_level, skill_level, 'Beginner');

create table if not exists public.general_user_stats (
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
  bust_count integer not null default 0,
  checkout_count integer not null default 0,
  highest_checkout integer not null default 0,
  count_high_checkout integer not null default 0,
  count_60_plus integer not null default 0,
  count_80_plus integer not null default 0,
  count_180 integer not null default 0,
  count_100_plus integer not null default 0,
  count_140_plus integer not null default 0,
  count_170_plus integer not null default 0,
  current_rating integer not null default 1000,
  last_match_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.general_user_stats (
  user_id,
  matches_played,
  wins,
  losses,
  legs_played,
  legs_won,
  legs_lost,
  total_scored_points,
  total_darts,
  average_per_3_darts,
  highest_turn_score,
  count_180,
  count_100_plus,
  count_140_plus,
  current_rating,
  last_match_at
)
select
  user_id,
  matches_played,
  wins,
  losses,
  legs_played,
  legs_won,
  legs_lost,
  total_scored_points,
  total_darts,
  average_per_3_darts,
  highest_turn_score,
  count_180,
  count_100_plus,
  count_140_plus,
  current_rating,
  last_match_at
from public.user_stats
on conflict (user_id) do nothing;

alter table public.user_stats
  add column if not exists bust_count integer not null default 0,
  add column if not exists checkout_count integer not null default 0,
  add column if not exists highest_checkout integer not null default 0,
  add column if not exists count_high_checkout integer not null default 0,
  add column if not exists count_60_plus integer not null default 0,
  add column if not exists count_80_plus integer not null default 0,
  add column if not exists count_170_plus integer not null default 0;

alter table public.general_user_stats
  add column if not exists bust_count integer not null default 0,
  add column if not exists checkout_count integer not null default 0,
  add column if not exists highest_checkout integer not null default 0,
  add column if not exists count_high_checkout integer not null default 0,
  add column if not exists count_60_plus integer not null default 0,
  add column if not exists count_80_plus integer not null default 0,
  add column if not exists count_170_plus integer not null default 0;

create table if not exists public.casual_matches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  player_a_user_id uuid not null references public.profiles(id) on delete cascade,
  player_b_user_id uuid references public.profiles(id) on delete set null,
  player_a_name text not null,
  player_b_name text not null,
  starting_score integer not null default 501 check (starting_score in (501, 701)),
  best_of integer not null default 3 check (best_of in (3, 5, 7)),
  winner_side text not null check (winner_side in ('A', 'B')),
  score_a integer not null default 0,
  score_b integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.casual_match_turns (
  id uuid primary key default gen_random_uuid(),
  casual_match_id uuid not null references public.casual_matches(id) on delete cascade,
  side text not null check (side in ('A', 'B')),
  turn_number integer not null,
  score integer not null check (score between 0 and 180),
  remaining_before integer not null,
  remaining_after integer not null,
  is_bust boolean not null default false,
  is_checkout boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.rating_logs
  add column if not exists rating_scope text not null default 'tournament',
  add column if not exists match_source text not null default 'tournament',
  add column if not exists casual_match_id uuid references public.casual_matches(id) on delete set null;

alter table public.match_turns
  add column if not exists darts integer not null default 3 check (darts between 1 and 3);

alter table public.casual_match_turns
  add column if not exists darts integer not null default 3 check (darts between 1 and 3);

alter table public.casual_matches
  add column if not exists confirmation_status text not null default 'not_required'
    check (confirmation_status in ('not_required', 'pending', 'confirmed', 'rejected')),
  add column if not exists opponent_confirmed_at timestamptz,
  add column if not exists opponent_rejected_at timestamptz,
  add column if not exists opponent_reject_reason text;

create index if not exists casual_matches_created_by_idx on public.casual_matches(created_by);
create index if not exists casual_matches_player_a_idx on public.casual_matches(player_a_user_id);
create index if not exists casual_matches_player_b_idx on public.casual_matches(player_b_user_id);
create index if not exists casual_turns_match_idx on public.casual_match_turns(casual_match_id);

drop trigger if exists general_user_stats_set_updated_at on public.general_user_stats;
create trigger general_user_stats_set_updated_at
before update on public.general_user_stats
for each row execute function public.set_updated_at();

drop trigger if exists casual_matches_set_updated_at on public.casual_matches;
create trigger casual_matches_set_updated_at
before update on public.casual_matches
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    display_name,
    rating,
    skill_level,
    tournament_rating,
    casual_rating,
    tournament_skill_level,
    casual_skill_level
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    1000,
    'Beginner',
    1000,
    1000,
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
    new.tournament_skill_level = old.tournament_skill_level;
    new.casual_skill_level = old.casual_skill_level;
    new.status = old.status;
  end if;
  return new;
end;
$$;

drop function if exists public.upsert_user_match_stats(uuid, boolean, integer, integer);
drop function if exists public.upsert_user_match_stats(uuid, boolean, integer, integer, integer, integer, integer, integer, integer, integer);
create or replace function public.upsert_user_match_stats(
  p_user_id uuid,
  p_won boolean,
  p_legs_won integer,
  p_legs_lost integer,
  p_total_scored_points integer default 0,
  p_total_darts integer default 0,
  p_highest_turn_score integer default 0,
  p_bust_count integer default 0,
  p_checkout_count integer default 0,
  p_highest_checkout integer default 0,
  p_count_high_checkout integer default 0,
  p_count_60_plus integer default 0,
  p_count_80_plus integer default 0,
  p_count_180 integer default 0,
  p_count_100_plus integer default 0,
  p_count_140_plus integer default 0,
  p_count_170_plus integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_rating integer;
begin
  select tournament_rating into profile_rating from public.profiles where id = p_user_id;

  insert into public.user_stats (
    user_id,
    matches_played,
    wins,
    losses,
    legs_played,
    legs_won,
    legs_lost,
    total_scored_points,
    total_darts,
    average_per_3_darts,
    highest_turn_score,
    bust_count,
    checkout_count,
    highest_checkout,
    count_high_checkout,
    count_60_plus,
    count_80_plus,
    count_180,
    count_100_plus,
    count_140_plus,
    count_170_plus,
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
    coalesce(p_total_scored_points, 0),
    coalesce(p_total_darts, 0),
    case
      when coalesce(p_total_darts, 0) > 0
      then round((coalesce(p_total_scored_points, 0)::numeric / p_total_darts::numeric) * 3, 2)
      else 0
    end,
    coalesce(p_highest_turn_score, 0),
    coalesce(p_bust_count, 0),
    coalesce(p_checkout_count, 0),
    coalesce(p_highest_checkout, 0),
    coalesce(p_count_high_checkout, 0),
    coalesce(p_count_60_plus, 0),
    coalesce(p_count_80_plus, 0),
    coalesce(p_count_180, 0),
    coalesce(p_count_100_plus, 0),
    coalesce(p_count_140_plus, 0),
    coalesce(p_count_170_plus, 0),
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
    total_scored_points = public.user_stats.total_scored_points + coalesce(p_total_scored_points, 0),
    total_darts = public.user_stats.total_darts + coalesce(p_total_darts, 0),
    average_per_3_darts = case
      when public.user_stats.total_darts + coalesce(p_total_darts, 0) > 0
      then round(((public.user_stats.total_scored_points + coalesce(p_total_scored_points, 0))::numeric / (public.user_stats.total_darts + coalesce(p_total_darts, 0))::numeric) * 3, 2)
      else public.user_stats.average_per_3_darts
    end,
    highest_turn_score = greatest(public.user_stats.highest_turn_score, coalesce(p_highest_turn_score, 0)),
    bust_count = public.user_stats.bust_count + coalesce(p_bust_count, 0),
    checkout_count = public.user_stats.checkout_count + coalesce(p_checkout_count, 0),
    highest_checkout = greatest(public.user_stats.highest_checkout, coalesce(p_highest_checkout, 0)),
    count_high_checkout = public.user_stats.count_high_checkout + coalesce(p_count_high_checkout, 0),
    count_60_plus = public.user_stats.count_60_plus + coalesce(p_count_60_plus, 0),
    count_80_plus = public.user_stats.count_80_plus + coalesce(p_count_80_plus, 0),
    count_180 = public.user_stats.count_180 + coalesce(p_count_180, 0),
    count_100_plus = public.user_stats.count_100_plus + coalesce(p_count_100_plus, 0),
    count_140_plus = public.user_stats.count_140_plus + coalesce(p_count_140_plus, 0),
    count_170_plus = public.user_stats.count_170_plus + coalesce(p_count_170_plus, 0),
    current_rating = coalesce(profile_rating, public.user_stats.current_rating),
    last_match_at = now(),
    updated_at = now();
end;
$$;

drop function if exists public.upsert_general_match_stats(uuid, boolean, integer, integer, integer, integer, integer, integer, integer, integer);
create or replace function public.upsert_general_match_stats(
  p_user_id uuid,
  p_won boolean,
  p_legs_won integer,
  p_legs_lost integer,
  p_total_scored_points integer default 0,
  p_total_darts integer default 0,
  p_highest_turn_score integer default 0,
  p_bust_count integer default 0,
  p_checkout_count integer default 0,
  p_highest_checkout integer default 0,
  p_count_high_checkout integer default 0,
  p_count_60_plus integer default 0,
  p_count_80_plus integer default 0,
  p_count_180 integer default 0,
  p_count_100_plus integer default 0,
  p_count_140_plus integer default 0,
  p_count_170_plus integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_rating integer;
begin
  select casual_rating into profile_rating from public.profiles where id = p_user_id;

  insert into public.general_user_stats (
    user_id,
    matches_played,
    wins,
    losses,
    legs_played,
    legs_won,
    legs_lost,
    total_scored_points,
    total_darts,
    average_per_3_darts,
    highest_turn_score,
    bust_count,
    checkout_count,
    highest_checkout,
    count_high_checkout,
    count_60_plus,
    count_80_plus,
    count_180,
    count_100_plus,
    count_140_plus,
    count_170_plus,
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
    coalesce(p_total_scored_points, 0),
    coalesce(p_total_darts, 0),
    case
      when coalesce(p_total_darts, 0) > 0
      then round((coalesce(p_total_scored_points, 0)::numeric / p_total_darts::numeric) * 3, 2)
      else 0
    end,
    coalesce(p_highest_turn_score, 0),
    coalesce(p_bust_count, 0),
    coalesce(p_checkout_count, 0),
    coalesce(p_highest_checkout, 0),
    coalesce(p_count_high_checkout, 0),
    coalesce(p_count_60_plus, 0),
    coalesce(p_count_80_plus, 0),
    coalesce(p_count_180, 0),
    coalesce(p_count_100_plus, 0),
    coalesce(p_count_140_plus, 0),
    coalesce(p_count_170_plus, 0),
    coalesce(profile_rating, 1000),
    now()
  )
  on conflict (user_id) do update set
    matches_played = public.general_user_stats.matches_played + 1,
    wins = public.general_user_stats.wins + case when p_won then 1 else 0 end,
    losses = public.general_user_stats.losses + case when p_won then 0 else 1 end,
    legs_played = public.general_user_stats.legs_played + coalesce(p_legs_won, 0) + coalesce(p_legs_lost, 0),
    legs_won = public.general_user_stats.legs_won + coalesce(p_legs_won, 0),
    legs_lost = public.general_user_stats.legs_lost + coalesce(p_legs_lost, 0),
    total_scored_points = public.general_user_stats.total_scored_points + coalesce(p_total_scored_points, 0),
    total_darts = public.general_user_stats.total_darts + coalesce(p_total_darts, 0),
    average_per_3_darts = case
      when public.general_user_stats.total_darts + coalesce(p_total_darts, 0) > 0
      then round(((public.general_user_stats.total_scored_points + coalesce(p_total_scored_points, 0))::numeric / (public.general_user_stats.total_darts + coalesce(p_total_darts, 0))::numeric) * 3, 2)
      else public.general_user_stats.average_per_3_darts
    end,
    highest_turn_score = greatest(public.general_user_stats.highest_turn_score, coalesce(p_highest_turn_score, 0)),
    bust_count = public.general_user_stats.bust_count + coalesce(p_bust_count, 0),
    checkout_count = public.general_user_stats.checkout_count + coalesce(p_checkout_count, 0),
    highest_checkout = greatest(public.general_user_stats.highest_checkout, coalesce(p_highest_checkout, 0)),
    count_high_checkout = public.general_user_stats.count_high_checkout + coalesce(p_count_high_checkout, 0),
    count_60_plus = public.general_user_stats.count_60_plus + coalesce(p_count_60_plus, 0),
    count_80_plus = public.general_user_stats.count_80_plus + coalesce(p_count_80_plus, 0),
    count_180 = public.general_user_stats.count_180 + coalesce(p_count_180, 0),
    count_100_plus = public.general_user_stats.count_100_plus + coalesce(p_count_100_plus, 0),
    count_140_plus = public.general_user_stats.count_140_plus + coalesce(p_count_140_plus, 0),
    count_170_plus = public.general_user_stats.count_170_plus + coalesce(p_count_170_plus, 0),
    current_rating = coalesce(profile_rating, public.general_user_stats.current_rating),
    last_match_at = now(),
    updated_at = now();
end;
$$;

alter table public.general_user_stats enable row level security;
alter table public.casual_matches enable row level security;
alter table public.casual_match_turns enable row level security;

drop policy if exists "general stats read own or admin" on public.general_user_stats;
create policy "general stats read own or admin" on public.general_user_stats
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "general stats admin write" on public.general_user_stats;
create policy "general stats admin write" on public.general_user_stats
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "casual matches read own or admin" on public.casual_matches;
create policy "casual matches read own or admin" on public.casual_matches
for select using (
  created_by = auth.uid()
  or player_a_user_id = auth.uid()
  or player_b_user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "casual matches insert own" on public.casual_matches;
create policy "casual matches insert own" on public.casual_matches
for insert with check (created_by = auth.uid() and player_a_user_id = auth.uid());

drop policy if exists "casual matches admin write" on public.casual_matches;
create policy "casual matches admin write" on public.casual_matches
for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "casual turns read own match or admin" on public.casual_match_turns;
create policy "casual turns read own match or admin" on public.casual_match_turns
for select using (
  public.is_admin()
  or exists (
    select 1 from public.casual_matches cm
    where cm.id = casual_match_id
      and (
        cm.created_by = auth.uid()
        or cm.player_a_user_id = auth.uid()
        or cm.player_b_user_id = auth.uid()
      )
  )
);

drop policy if exists "casual turns insert own match" on public.casual_match_turns;
create policy "casual turns insert own match" on public.casual_match_turns
for insert with check (
  exists (
    select 1 from public.casual_matches cm
    where cm.id = casual_match_id
      and cm.created_by = auth.uid()
  )
);
