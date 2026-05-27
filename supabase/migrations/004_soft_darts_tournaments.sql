alter table public.profiles
  add column if not exists soft_rating integer not null default 1000,
  add column if not exists soft_skill_level text not null default 'Beginner';

update public.profiles
set
  soft_rating = coalesce(soft_rating, rating, 1000),
  soft_skill_level = coalesce(soft_skill_level, skill_level, 'Beginner');

alter table public.tournaments
  add column if not exists dart_mode text not null default 'steel',
  add column if not exists soft_game text not null default 'soft_501',
  add column if not exists mixed_first_dart_mode text not null default 'soft',
  add column if not exists soft_machine_provider text not null default 'manual',
  add column if not exists soft_machine_event_ref text,
  add column if not exists soft_machine_sync_enabled boolean not null default false;

alter table public.tournaments
  drop constraint if exists tournaments_dart_mode_check,
  add constraint tournaments_dart_mode_check
    check (dart_mode in ('steel', 'soft', 'mixed_alternating')),
  drop constraint if exists tournaments_soft_game_check,
  add constraint tournaments_soft_game_check
    check (soft_game in ('soft_301', 'soft_501', 'soft_cricket', 'snow_501', 'snow_701')),
  drop constraint if exists tournaments_mixed_first_dart_mode_check,
  add constraint tournaments_mixed_first_dart_mode_check
    check (mixed_first_dart_mode in ('soft', 'steel')),
  drop constraint if exists tournaments_soft_game_doubles_check,
  add constraint tournaments_soft_game_doubles_check
    check (
      dart_mode = 'steel'
      or soft_game not in ('snow_501', 'snow_701')
      or (tournament_type = 'doubles' and team_size = 2)
    );

alter table public.matches
  add column if not exists dart_mode text not null default 'steel',
  add column if not exists game_variant text not null default '501';

alter table public.matches
  drop constraint if exists matches_dart_mode_check,
  add constraint matches_dart_mode_check check (dart_mode in ('steel', 'soft'));

update public.matches m
set
  dart_mode = case
    when t.dart_mode = 'soft' then 'soft'
    when t.dart_mode = 'mixed_alternating'
      and (
        (coalesce(t.mixed_first_dart_mode, 'soft') = 'soft' and mod(greatest(m.round_number, 1), 2) = 1)
        or
        (coalesce(t.mixed_first_dart_mode, 'soft') = 'steel' and mod(greatest(m.round_number, 1), 2) = 0)
      )
      then 'soft'
    else 'steel'
  end,
  game_variant = case
    when t.dart_mode = 'soft' then coalesce(t.soft_game, 'soft_501')
    when t.dart_mode = 'mixed_alternating'
      and (
        (coalesce(t.mixed_first_dart_mode, 'soft') = 'soft' and mod(greatest(m.round_number, 1), 2) = 1)
        or
        (coalesce(t.mixed_first_dart_mode, 'soft') = 'steel' and mod(greatest(m.round_number, 1), 2) = 0)
      )
      then coalesce(t.soft_game, 'soft_501')
    else coalesce(t.dart_game::text, '501')
  end
from public.tournaments t
where t.id = m.tournament_id;

alter table public.match_result_confirmations
  add column if not exists details jsonb not null default '{}'::jsonb;

create table if not exists public.soft_user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  legs_played integer not null default 0,
  legs_won integer not null default 0,
  legs_lost integer not null default 0,
  average_score numeric(8, 2) not null default 0,
  average_score_total numeric(12, 2) not null default 0,
  average_score_samples integer not null default 0,
  average_mpr numeric(8, 2) not null default 0,
  average_mpr_total numeric(12, 2) not null default 0,
  average_mpr_samples integer not null default 0,
  highest_checkout integer not null default 0,
  count_high_checkout integer not null default 0,
  count_ton80 integer not null default 0,
  count_hat_trick integer not null default 0,
  count_white_horse integer not null default 0,
  current_rating integer not null default 1000,
  last_match_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists soft_user_stats_last_match_idx on public.soft_user_stats(last_match_at);

drop trigger if exists soft_user_stats_set_updated_at on public.soft_user_stats;
create trigger soft_user_stats_set_updated_at
before update on public.soft_user_stats
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
    soft_rating,
    tournament_skill_level,
    casual_skill_level,
    soft_skill_level
  )
  values (
    new.id,
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
  return new;
end;
$$;

create or replace function public.upsert_soft_match_stats(
  p_user_id uuid,
  p_won boolean,
  p_legs_won integer,
  p_legs_lost integer,
  p_average_score numeric default null,
  p_average_mpr numeric default null,
  p_highest_checkout integer default 0,
  p_count_high_checkout integer default 0,
  p_count_ton80 integer default 0,
  p_count_hat_trick integer default 0,
  p_count_white_horse integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_rating integer;
  score_samples integer;
  mpr_samples integer;
begin
  select soft_rating into profile_rating from public.profiles where id = p_user_id;
  score_samples := case when p_average_score is null then 0 else 1 end;
  mpr_samples := case when p_average_mpr is null then 0 else 1 end;

  insert into public.soft_user_stats (
    user_id,
    matches_played,
    wins,
    losses,
    legs_played,
    legs_won,
    legs_lost,
    average_score,
    average_score_total,
    average_score_samples,
    average_mpr,
    average_mpr_total,
    average_mpr_samples,
    highest_checkout,
    count_high_checkout,
    count_ton80,
    count_hat_trick,
    count_white_horse,
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
    coalesce(p_average_score, 0),
    coalesce(p_average_score, 0),
    score_samples,
    coalesce(p_average_mpr, 0),
    coalesce(p_average_mpr, 0),
    mpr_samples,
    coalesce(p_highest_checkout, 0),
    coalesce(p_count_high_checkout, 0),
    coalesce(p_count_ton80, 0),
    coalesce(p_count_hat_trick, 0),
    coalesce(p_count_white_horse, 0),
    coalesce(profile_rating, 1000),
    now()
  )
  on conflict (user_id) do update set
    matches_played = public.soft_user_stats.matches_played + 1,
    wins = public.soft_user_stats.wins + case when p_won then 1 else 0 end,
    losses = public.soft_user_stats.losses + case when p_won then 0 else 1 end,
    legs_played = public.soft_user_stats.legs_played + coalesce(p_legs_won, 0) + coalesce(p_legs_lost, 0),
    legs_won = public.soft_user_stats.legs_won + coalesce(p_legs_won, 0),
    legs_lost = public.soft_user_stats.legs_lost + coalesce(p_legs_lost, 0),
    average_score_total = public.soft_user_stats.average_score_total + coalesce(p_average_score, 0),
    average_score_samples = public.soft_user_stats.average_score_samples + score_samples,
    average_score = case
      when public.soft_user_stats.average_score_samples + score_samples > 0
      then round(
        (public.soft_user_stats.average_score_total + coalesce(p_average_score, 0))
        / (public.soft_user_stats.average_score_samples + score_samples),
        2
      )
      else public.soft_user_stats.average_score
    end,
    average_mpr_total = public.soft_user_stats.average_mpr_total + coalesce(p_average_mpr, 0),
    average_mpr_samples = public.soft_user_stats.average_mpr_samples + mpr_samples,
    average_mpr = case
      when public.soft_user_stats.average_mpr_samples + mpr_samples > 0
      then round(
        (public.soft_user_stats.average_mpr_total + coalesce(p_average_mpr, 0))
        / (public.soft_user_stats.average_mpr_samples + mpr_samples),
        2
      )
      else public.soft_user_stats.average_mpr
    end,
    highest_checkout = greatest(public.soft_user_stats.highest_checkout, coalesce(p_highest_checkout, 0)),
    count_high_checkout = public.soft_user_stats.count_high_checkout + coalesce(p_count_high_checkout, 0),
    count_ton80 = public.soft_user_stats.count_ton80 + coalesce(p_count_ton80, 0),
    count_hat_trick = public.soft_user_stats.count_hat_trick + coalesce(p_count_hat_trick, 0),
    count_white_horse = public.soft_user_stats.count_white_horse + coalesce(p_count_white_horse, 0),
    current_rating = coalesce(profile_rating, public.soft_user_stats.current_rating),
    last_match_at = now(),
    updated_at = now();
end;
$$;

alter table public.soft_user_stats enable row level security;

drop policy if exists "soft stats read own or admin" on public.soft_user_stats;
create policy "soft stats read own or admin" on public.soft_user_stats
for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "soft stats admin write" on public.soft_user_stats;
create policy "soft stats admin write" on public.soft_user_stats
for all using (public.is_admin()) with check (public.is_admin());
