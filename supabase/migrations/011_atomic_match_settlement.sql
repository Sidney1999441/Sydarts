create table if not exists public.match_settlements (
  match_id uuid primary key references public.matches(id) on delete cascade,
  submission_id uuid,
  details jsonb not null default '{}'::jsonb,
  settled_at timestamptz not null default now(),
  recalculated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.match_user_stat_baselines (
  user_id uuid not null references public.profiles(id) on delete cascade,
  stats_scope text not null check (stats_scope in ('tournament', 'general', 'soft')),
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  legs_played integer not null default 0,
  legs_won integer not null default 0,
  legs_lost integer not null default 0,
  total_scored_points integer not null default 0,
  total_darts integer not null default 0,
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
  average_score_total numeric(12, 2) not null default 0,
  average_score_samples integer not null default 0,
  average_mpr_total numeric(12, 2) not null default 0,
  average_mpr_samples integer not null default 0,
  count_ton80 integer not null default 0,
  count_hat_trick integer not null default 0,
  count_white_horse integer not null default 0,
  total_marks integer not null default 0,
  count_5_marks integer not null default 0,
  count_6_marks integer not null default 0,
  count_7_marks integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, stats_scope)
);

create table if not exists public.match_user_stat_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  stats_scope text not null check (stats_scope in ('tournament', 'general', 'soft')),
  matches_played integer not null default 1,
  wins integer not null default 0,
  losses integer not null default 0,
  legs_played integer not null default 0,
  legs_won integer not null default 0,
  legs_lost integer not null default 0,
  total_scored_points integer not null default 0,
  total_darts integer not null default 0,
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
  average_score_total numeric(12, 2) not null default 0,
  average_score_samples integer not null default 0,
  average_mpr_total numeric(12, 2) not null default 0,
  average_mpr_samples integer not null default 0,
  count_ton80 integer not null default 0,
  count_hat_trick integer not null default 0,
  count_white_horse integer not null default 0,
  total_marks integer not null default 0,
  count_5_marks integer not null default 0,
  count_6_marks integer not null default 0,
  count_7_marks integer not null default 0,
  created_at timestamptz not null default now(),
  unique (match_id, user_id, stats_scope)
);

insert into public.match_user_stat_baselines (
  user_id,
  stats_scope,
  matches_played,
  wins,
  losses,
  legs_played,
  legs_won,
  legs_lost,
  total_scored_points,
  total_darts,
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
  count_170_plus
)
select
  user_id,
  'tournament',
  matches_played,
  wins,
  losses,
  legs_played,
  legs_won,
  legs_lost,
  total_scored_points,
  total_darts,
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
  count_170_plus
from public.user_stats
on conflict (user_id, stats_scope) do nothing;

insert into public.match_user_stat_baselines (
  user_id,
  stats_scope,
  matches_played,
  wins,
  losses,
  legs_played,
  legs_won,
  legs_lost,
  total_scored_points,
  total_darts,
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
  count_170_plus
)
select
  user_id,
  'general',
  matches_played,
  wins,
  losses,
  legs_played,
  legs_won,
  legs_lost,
  total_scored_points,
  total_darts,
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
  count_170_plus
from public.general_user_stats
on conflict (user_id, stats_scope) do nothing;

insert into public.match_user_stat_baselines (
  user_id,
  stats_scope,
  matches_played,
  wins,
  losses,
  legs_played,
  legs_won,
  legs_lost,
  average_score_total,
  average_score_samples,
  average_mpr_total,
  average_mpr_samples,
  highest_checkout,
  count_high_checkout,
  count_ton80,
  count_hat_trick,
  count_white_horse,
  total_marks,
  count_5_marks,
  count_6_marks,
  count_7_marks
)
select
  user_id,
  'soft',
  matches_played,
  wins,
  losses,
  legs_played,
  legs_won,
  legs_lost,
  average_score_total,
  average_score_samples,
  average_mpr_total,
  average_mpr_samples,
  highest_checkout,
  count_high_checkout,
  count_ton80,
  count_hat_trick,
  count_white_horse,
  total_marks,
  count_5_marks,
  count_6_marks,
  count_7_marks
from public.soft_user_stats
on conflict (user_id, stats_scope) do nothing;

create index if not exists match_user_stat_events_match_idx
on public.match_user_stat_events(match_id);

create index if not exists match_user_stat_events_user_scope_idx
on public.match_user_stat_events(user_id, stats_scope);

drop trigger if exists match_settlements_set_updated_at on public.match_settlements;
create trigger match_settlements_set_updated_at
before update on public.match_settlements
for each row execute function public.set_updated_at();

drop trigger if exists match_user_stat_baselines_set_updated_at on public.match_user_stat_baselines;
create trigger match_user_stat_baselines_set_updated_at
before update on public.match_user_stat_baselines
for each row execute function public.set_updated_at();

alter table public.match_settlements enable row level security;
alter table public.match_user_stat_baselines enable row level security;
alter table public.match_user_stat_events enable row level security;

create or replace function public.ensure_match_user_stat_baseline(
  p_user_id uuid,
  p_stats_scope text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_stats_scope not in ('tournament', 'general', 'soft') then
    raise exception 'Unsupported stats scope: %', p_stats_scope;
  end if;

  if p_stats_scope = 'tournament' then
    insert into public.match_user_stat_baselines (
      user_id,
      stats_scope,
      matches_played,
      wins,
      losses,
      legs_played,
      legs_won,
      legs_lost,
      total_scored_points,
      total_darts,
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
      count_170_plus
    )
    select
      user_id,
      'tournament',
      matches_played,
      wins,
      losses,
      legs_played,
      legs_won,
      legs_lost,
      total_scored_points,
      total_darts,
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
      count_170_plus
    from public.user_stats
    where user_id = p_user_id
    on conflict (user_id, stats_scope) do nothing;
  elsif p_stats_scope = 'general' then
    insert into public.match_user_stat_baselines (
      user_id,
      stats_scope,
      matches_played,
      wins,
      losses,
      legs_played,
      legs_won,
      legs_lost,
      total_scored_points,
      total_darts,
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
      count_170_plus
    )
    select
      user_id,
      'general',
      matches_played,
      wins,
      losses,
      legs_played,
      legs_won,
      legs_lost,
      total_scored_points,
      total_darts,
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
      count_170_plus
    from public.general_user_stats
    where user_id = p_user_id
    on conflict (user_id, stats_scope) do nothing;
  else
    insert into public.match_user_stat_baselines (
      user_id,
      stats_scope,
      matches_played,
      wins,
      losses,
      legs_played,
      legs_won,
      legs_lost,
      average_score_total,
      average_score_samples,
      average_mpr_total,
      average_mpr_samples,
      highest_checkout,
      count_high_checkout,
      count_ton80,
      count_hat_trick,
      count_white_horse,
      total_marks,
      count_5_marks,
      count_6_marks,
      count_7_marks
    )
    select
      user_id,
      'soft',
      matches_played,
      wins,
      losses,
      legs_played,
      legs_won,
      legs_lost,
      average_score_total,
      average_score_samples,
      average_mpr_total,
      average_mpr_samples,
      highest_checkout,
      count_high_checkout,
      count_ton80,
      count_hat_trick,
      count_white_horse,
      total_marks,
      count_5_marks,
      count_6_marks,
      count_7_marks
    from public.soft_user_stats
    where user_id = p_user_id
    on conflict (user_id, stats_scope) do nothing;
  end if;

  insert into public.match_user_stat_baselines (user_id, stats_scope)
  values (p_user_id, p_stats_scope)
  on conflict (user_id, stats_scope) do nothing;
end;
$$;

create or replace function public.refresh_match_user_stats_from_events(
  p_user_id uuid,
  p_stats_scope text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.match_user_stat_baselines%rowtype;
  e record;
  profile_rating integer;
  v_matches_played integer;
  v_wins integer;
  v_losses integer;
  v_legs_played integer;
  v_legs_won integer;
  v_legs_lost integer;
  v_total_scored_points integer;
  v_total_darts integer;
  v_average_per_3_darts numeric(8, 2);
  v_highest_turn_score integer;
  v_bust_count integer;
  v_checkout_count integer;
  v_highest_checkout integer;
  v_count_high_checkout integer;
  v_count_60_plus integer;
  v_count_80_plus integer;
  v_count_180 integer;
  v_count_100_plus integer;
  v_count_140_plus integer;
  v_count_170_plus integer;
  v_average_score_total numeric(12, 2);
  v_average_score_samples integer;
  v_average_score numeric(8, 2);
  v_average_mpr_total numeric(12, 2);
  v_average_mpr_samples integer;
  v_average_mpr numeric(8, 2);
  v_count_ton80 integer;
  v_count_hat_trick integer;
  v_count_white_horse integer;
  v_total_marks integer;
  v_count_5_marks integer;
  v_count_6_marks integer;
  v_count_7_marks integer;
begin
  perform public.ensure_match_user_stat_baseline(p_user_id, p_stats_scope);

  select * into b
  from public.match_user_stat_baselines
  where user_id = p_user_id and stats_scope = p_stats_scope;

  select
    coalesce(sum(matches_played), 0)::integer as matches_played,
    coalesce(sum(wins), 0)::integer as wins,
    coalesce(sum(losses), 0)::integer as losses,
    coalesce(sum(legs_played), 0)::integer as legs_played,
    coalesce(sum(legs_won), 0)::integer as legs_won,
    coalesce(sum(legs_lost), 0)::integer as legs_lost,
    coalesce(sum(total_scored_points), 0)::integer as total_scored_points,
    coalesce(sum(total_darts), 0)::integer as total_darts,
    coalesce(max(highest_turn_score), 0)::integer as highest_turn_score,
    coalesce(sum(bust_count), 0)::integer as bust_count,
    coalesce(sum(checkout_count), 0)::integer as checkout_count,
    coalesce(max(highest_checkout), 0)::integer as highest_checkout,
    coalesce(sum(count_high_checkout), 0)::integer as count_high_checkout,
    coalesce(sum(count_60_plus), 0)::integer as count_60_plus,
    coalesce(sum(count_80_plus), 0)::integer as count_80_plus,
    coalesce(sum(count_180), 0)::integer as count_180,
    coalesce(sum(count_100_plus), 0)::integer as count_100_plus,
    coalesce(sum(count_140_plus), 0)::integer as count_140_plus,
    coalesce(sum(count_170_plus), 0)::integer as count_170_plus,
    coalesce(sum(average_score_total), 0)::numeric as average_score_total,
    coalesce(sum(average_score_samples), 0)::integer as average_score_samples,
    coalesce(sum(average_mpr_total), 0)::numeric as average_mpr_total,
    coalesce(sum(average_mpr_samples), 0)::integer as average_mpr_samples,
    coalesce(sum(count_ton80), 0)::integer as count_ton80,
    coalesce(sum(count_hat_trick), 0)::integer as count_hat_trick,
    coalesce(sum(count_white_horse), 0)::integer as count_white_horse,
    coalesce(sum(total_marks), 0)::integer as total_marks,
    coalesce(sum(count_5_marks), 0)::integer as count_5_marks,
    coalesce(sum(count_6_marks), 0)::integer as count_6_marks,
    coalesce(sum(count_7_marks), 0)::integer as count_7_marks
  into e
  from public.match_user_stat_events
  where user_id = p_user_id and stats_scope = p_stats_scope;

  v_matches_played := b.matches_played + e.matches_played;
  v_wins := b.wins + e.wins;
  v_losses := b.losses + e.losses;
  v_legs_played := b.legs_played + e.legs_played;
  v_legs_won := b.legs_won + e.legs_won;
  v_legs_lost := b.legs_lost + e.legs_lost;
  v_total_scored_points := b.total_scored_points + e.total_scored_points;
  v_total_darts := b.total_darts + e.total_darts;
  v_highest_turn_score := greatest(b.highest_turn_score, e.highest_turn_score);
  v_bust_count := b.bust_count + e.bust_count;
  v_checkout_count := b.checkout_count + e.checkout_count;
  v_highest_checkout := greatest(b.highest_checkout, e.highest_checkout);
  v_count_high_checkout := b.count_high_checkout + e.count_high_checkout;
  v_count_60_plus := b.count_60_plus + e.count_60_plus;
  v_count_80_plus := b.count_80_plus + e.count_80_plus;
  v_count_180 := b.count_180 + e.count_180;
  v_count_100_plus := b.count_100_plus + e.count_100_plus;
  v_count_140_plus := b.count_140_plus + e.count_140_plus;
  v_count_170_plus := b.count_170_plus + e.count_170_plus;
  v_average_score_total := b.average_score_total + e.average_score_total;
  v_average_score_samples := b.average_score_samples + e.average_score_samples;
  v_average_mpr_total := b.average_mpr_total + e.average_mpr_total;
  v_average_mpr_samples := b.average_mpr_samples + e.average_mpr_samples;
  v_count_ton80 := b.count_ton80 + e.count_ton80;
  v_count_hat_trick := b.count_hat_trick + e.count_hat_trick;
  v_count_white_horse := b.count_white_horse + e.count_white_horse;
  v_total_marks := b.total_marks + e.total_marks;
  v_count_5_marks := b.count_5_marks + e.count_5_marks;
  v_count_6_marks := b.count_6_marks + e.count_6_marks;
  v_count_7_marks := b.count_7_marks + e.count_7_marks;

  if p_stats_scope = 'tournament' then
    select tournament_rating into profile_rating from public.profiles where id = p_user_id;
    v_average_per_3_darts := case
      when v_total_darts > 0
      then round((v_total_scored_points::numeric / v_total_darts::numeric) * 3, 2)
      else 0
    end;

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
      v_matches_played,
      v_wins,
      v_losses,
      v_legs_played,
      v_legs_won,
      v_legs_lost,
      v_total_scored_points,
      v_total_darts,
      v_average_per_3_darts,
      v_highest_turn_score,
      v_bust_count,
      v_checkout_count,
      v_highest_checkout,
      v_count_high_checkout,
      v_count_60_plus,
      v_count_80_plus,
      v_count_180,
      v_count_100_plus,
      v_count_140_plus,
      v_count_170_plus,
      coalesce(profile_rating, 1000),
      now()
    )
    on conflict (user_id) do update set
      matches_played = excluded.matches_played,
      wins = excluded.wins,
      losses = excluded.losses,
      legs_played = excluded.legs_played,
      legs_won = excluded.legs_won,
      legs_lost = excluded.legs_lost,
      total_scored_points = excluded.total_scored_points,
      total_darts = excluded.total_darts,
      average_per_3_darts = excluded.average_per_3_darts,
      highest_turn_score = excluded.highest_turn_score,
      bust_count = excluded.bust_count,
      checkout_count = excluded.checkout_count,
      highest_checkout = excluded.highest_checkout,
      count_high_checkout = excluded.count_high_checkout,
      count_60_plus = excluded.count_60_plus,
      count_80_plus = excluded.count_80_plus,
      count_180 = excluded.count_180,
      count_100_plus = excluded.count_100_plus,
      count_140_plus = excluded.count_140_plus,
      count_170_plus = excluded.count_170_plus,
      current_rating = excluded.current_rating,
      last_match_at = excluded.last_match_at,
      updated_at = now();
  elsif p_stats_scope = 'general' then
    select casual_rating into profile_rating from public.profiles where id = p_user_id;
    v_average_per_3_darts := case
      when v_total_darts > 0
      then round((v_total_scored_points::numeric / v_total_darts::numeric) * 3, 2)
      else 0
    end;

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
      v_matches_played,
      v_wins,
      v_losses,
      v_legs_played,
      v_legs_won,
      v_legs_lost,
      v_total_scored_points,
      v_total_darts,
      v_average_per_3_darts,
      v_highest_turn_score,
      v_bust_count,
      v_checkout_count,
      v_highest_checkout,
      v_count_high_checkout,
      v_count_60_plus,
      v_count_80_plus,
      v_count_180,
      v_count_100_plus,
      v_count_140_plus,
      v_count_170_plus,
      coalesce(profile_rating, 1000),
      now()
    )
    on conflict (user_id) do update set
      matches_played = excluded.matches_played,
      wins = excluded.wins,
      losses = excluded.losses,
      legs_played = excluded.legs_played,
      legs_won = excluded.legs_won,
      legs_lost = excluded.legs_lost,
      total_scored_points = excluded.total_scored_points,
      total_darts = excluded.total_darts,
      average_per_3_darts = excluded.average_per_3_darts,
      highest_turn_score = excluded.highest_turn_score,
      bust_count = excluded.bust_count,
      checkout_count = excluded.checkout_count,
      highest_checkout = excluded.highest_checkout,
      count_high_checkout = excluded.count_high_checkout,
      count_60_plus = excluded.count_60_plus,
      count_80_plus = excluded.count_80_plus,
      count_180 = excluded.count_180,
      count_100_plus = excluded.count_100_plus,
      count_140_plus = excluded.count_140_plus,
      count_170_plus = excluded.count_170_plus,
      current_rating = excluded.current_rating,
      last_match_at = excluded.last_match_at,
      updated_at = now();
  elsif p_stats_scope = 'soft' then
    select soft_rating into profile_rating from public.profiles where id = p_user_id;
    v_average_score := case
      when v_average_score_samples > 0
      then round(v_average_score_total / v_average_score_samples, 2)
      else 0
    end;
    v_average_mpr := case
      when v_average_mpr_samples > 0
      then round(v_average_mpr_total / v_average_mpr_samples, 2)
      else 0
    end;

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
      total_marks,
      count_5_marks,
      count_6_marks,
      count_7_marks,
      current_rating,
      last_match_at
    )
    values (
      p_user_id,
      v_matches_played,
      v_wins,
      v_losses,
      v_legs_played,
      v_legs_won,
      v_legs_lost,
      v_average_score,
      v_average_score_total,
      v_average_score_samples,
      v_average_mpr,
      v_average_mpr_total,
      v_average_mpr_samples,
      v_highest_checkout,
      v_count_high_checkout,
      v_count_ton80,
      v_count_hat_trick,
      v_count_white_horse,
      v_total_marks,
      v_count_5_marks,
      v_count_6_marks,
      v_count_7_marks,
      coalesce(profile_rating, 1000),
      now()
    )
    on conflict (user_id) do update set
      matches_played = excluded.matches_played,
      wins = excluded.wins,
      losses = excluded.losses,
      legs_played = excluded.legs_played,
      legs_won = excluded.legs_won,
      legs_lost = excluded.legs_lost,
      average_score = excluded.average_score,
      average_score_total = excluded.average_score_total,
      average_score_samples = excluded.average_score_samples,
      average_mpr = excluded.average_mpr,
      average_mpr_total = excluded.average_mpr_total,
      average_mpr_samples = excluded.average_mpr_samples,
      highest_checkout = excluded.highest_checkout,
      count_high_checkout = excluded.count_high_checkout,
      count_ton80 = excluded.count_ton80,
      count_hat_trick = excluded.count_hat_trick,
      count_white_horse = excluded.count_white_horse,
      total_marks = excluded.total_marks,
      count_5_marks = excluded.count_5_marks,
      count_6_marks = excluded.count_6_marks,
      count_7_marks = excluded.count_7_marks,
      current_rating = excluded.current_rating,
      last_match_at = excluded.last_match_at,
      updated_at = now();
  else
    raise exception 'Unsupported stats scope: %', p_stats_scope;
  end if;
end;
$$;

create or replace function public.settle_tournament_match(
  p_match_id uuid,
  p_winner_participant_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_details jsonb,
  p_leg_results jsonb,
  p_turns jsonb,
  p_rating_logs jsonb,
  p_stat_events jsonb,
  p_confirmation_id uuid default null,
  p_recalculate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_settlement public.match_settlements%rowtype;
  v_submission_text text;
  v_submission_uuid uuid;
  v_has_rating_logs boolean;
  v_has_stat_events boolean;
  v_confirmation_id uuid;
  v_leg jsonb;
  v_turn jsonb;
  v_rating jsonb;
  v_stat jsonb;
  v_leg_id uuid;
  v_leg_number integer;
  v_participant_a_user_ids uuid[];
  v_participant_b_user_ids uuid[];
  v_rating_user_id uuid;
  v_rating_scope text;
  v_rating_delta integer;
  v_stat_user_id uuid;
  v_stats_scope text;
  v_average_score_samples integer;
  v_average_mpr_samples integer;
  affected record;
  rating_delta record;
begin
  select * into v_match
  from public.matches
  where id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found.';
  end if;

  if v_match.status = 'bye' then
    raise exception 'This match has already been settled.';
  end if;

  if v_match.participant_a_id is null or v_match.participant_b_id is null then
    raise exception 'Cannot settle a match without two participants.';
  end if;

  if p_winner_participant_id is not null
    and p_winner_participant_id <> v_match.participant_a_id
    and p_winner_participant_id <> v_match.participant_b_id
  then
    raise exception 'Winner must be one of the match participants.';
  end if;

  v_submission_text := nullif(p_details ->> 'submissionId', '');
  if v_submission_text is not null then
    begin
      v_submission_uuid := v_submission_text::uuid;
    exception
      when invalid_text_representation then
        v_submission_uuid := null;
    end;
  end if;

  select * into v_settlement
  from public.match_settlements
  where match_id = p_match_id
  for update;

  if v_match.status = 'completed' and not p_recalculate then
    if v_submission_text is not null and v_match.details ->> 'submissionId' = v_submission_text then
      if v_settlement.match_id is not null then
        return jsonb_build_object('status', 'already_settled', 'matchId', p_match_id);
      end if;

      select exists(select 1 from public.rating_logs where match_id = p_match_id)
      into v_has_rating_logs;
      select exists(select 1 from public.match_user_stat_events where match_id = p_match_id)
      into v_has_stat_events;

      if v_has_rating_logs or v_has_stat_events then
        return jsonb_build_object('status', 'already_settled_legacy', 'matchId', p_match_id);
      end if;
    else
      raise exception 'This match has already been settled.';
    end if;
  end if;

  if p_recalculate and v_match.status = 'completed' then
    select exists(select 1 from public.rating_logs where match_id = p_match_id)
    into v_has_rating_logs;
    select exists(select 1 from public.match_user_stat_events where match_id = p_match_id)
    into v_has_stat_events;

    if v_has_rating_logs and not v_has_stat_events then
      raise exception 'Cannot recalculate a legacy match without settlement stat events.';
    end if;
  end if;

  for rating_delta in
    select user_id, rating_scope, sum(delta)::integer as delta
    from public.rating_logs
    where match_id = p_match_id
    group by user_id, rating_scope
  loop
    if rating_delta.rating_scope = 'tournament' then
      update public.profiles
      set
        rating = greatest(100, coalesce(rating, 1000) - rating_delta.delta),
        tournament_rating = greatest(100, coalesce(tournament_rating, rating, 1000) - rating_delta.delta)
      where id = rating_delta.user_id;
    elsif rating_delta.rating_scope = 'general' then
      update public.profiles
      set casual_rating = greatest(100, coalesce(casual_rating, rating, 1000) - rating_delta.delta)
      where id = rating_delta.user_id;
    elsif rating_delta.rating_scope = 'soft' then
      update public.profiles
      set soft_rating = greatest(100, coalesce(soft_rating, rating, 1000) - rating_delta.delta)
      where id = rating_delta.user_id;
    end if;
  end loop;

  delete from public.rating_logs
  where match_id = p_match_id;

  for affected in
    delete from public.match_user_stat_events
    where match_id = p_match_id
    returning user_id, stats_scope
  loop
    perform public.refresh_match_user_stats_from_events(affected.user_id, affected.stats_scope);
  end loop;

  delete from public.match_turns where match_id = p_match_id;
  delete from public.match_legs where match_id = p_match_id;

  if p_confirmation_id is not null then
    update public.match_result_confirmations
    set status = 'confirmed', confirmed_at = now()
    where id = p_confirmation_id
      and match_id = p_match_id
      and status = 'pending'
    returning id into v_confirmation_id;

    if v_confirmation_id is null then
      raise exception 'This confirmation has already been handled.';
    end if;
  end if;

  update public.matches
  set
    winner_participant_id = p_winner_participant_id,
    score_a = coalesce(p_score_a, 0),
    score_b = coalesce(p_score_b, 0),
    status = 'completed',
    details = coalesce(p_details, '{}'::jsonb)
  where id = p_match_id;

  for v_leg in
    select value from jsonb_array_elements(coalesce(p_leg_results, '[]'::jsonb))
  loop
    select coalesce(array_agg(id_value::uuid), '{}'::uuid[])
    into v_participant_a_user_ids
    from jsonb_array_elements_text(coalesce(v_leg -> 'participantAUserIds', '[]'::jsonb)) as ids(id_value);

    select coalesce(array_agg(id_value::uuid), '{}'::uuid[])
    into v_participant_b_user_ids
    from jsonb_array_elements_text(coalesce(v_leg -> 'participantBUserIds', '[]'::jsonb)) as ids(id_value);

    insert into public.match_legs (
      match_id,
      leg_number,
      starting_score,
      participant_mode,
      dart_mode,
      game_variant,
      participant_a_user_ids,
      participant_b_user_ids,
      winner_participant_id,
      checkout_score,
      status
    )
    values (
      p_match_id,
      coalesce((v_leg ->> 'legNumber')::integer, 1),
      coalesce((v_leg ->> 'startingScore')::integer, 501),
      coalesce(v_leg ->> 'participantMode', 'doubles'),
      coalesce(v_leg ->> 'dartMode', v_match.dart_mode, 'steel'),
      coalesce(v_leg ->> 'gameVariant', v_match.game_variant, '501'),
      v_participant_a_user_ids,
      v_participant_b_user_ids,
      nullif(v_leg ->> 'winnerParticipantId', '')::uuid,
      nullif(v_leg ->> 'checkoutScore', '')::integer,
      'completed'
    );
  end loop;

  for v_turn in
    select value from jsonb_array_elements(coalesce(p_turns, '[]'::jsonb)) with ordinality as turns(value, ordinal)
  loop
    v_leg_number := coalesce((v_turn ->> 'legNumber')::integer, 1);
    select id into v_leg_id
    from public.match_legs
    where match_id = p_match_id and leg_number = v_leg_number;

    insert into public.match_turns (
      match_id,
      leg_id,
      participant_id,
      user_id,
      leg_number,
      turn_number,
      score,
      darts,
      remaining_before,
      remaining_after,
      is_bust,
      is_checkout
    )
    values (
      p_match_id,
      v_leg_id,
      (v_turn ->> 'participantId')::uuid,
      nullif(v_turn ->> 'userId', '')::uuid,
      v_leg_number,
      coalesce(
        (v_turn ->> 'turnNumber')::integer,
        ((select count(*) from public.match_turns where match_id = p_match_id)::integer + 1)
      ),
      coalesce((v_turn ->> 'score')::integer, 0),
      coalesce((v_turn ->> 'darts')::integer, 3),
      coalesce((v_turn ->> 'remainingBefore')::integer, 0),
      coalesce((v_turn ->> 'remainingAfter')::integer, 0),
      coalesce((v_turn ->> 'isBust')::boolean, false),
      coalesce((v_turn ->> 'isCheckout')::boolean, false)
    );
  end loop;

  for v_rating in
    select value from jsonb_array_elements(coalesce(p_rating_logs, '[]'::jsonb))
  loop
    v_rating_user_id := (v_rating ->> 'userId')::uuid;
    v_rating_scope := coalesce(v_rating ->> 'ratingScope', 'tournament');
    v_rating_delta := coalesce((v_rating ->> 'delta')::integer, 0);

    insert into public.rating_logs (
      user_id,
      tournament_id,
      match_id,
      rating_before,
      rating_after,
      delta,
      reason,
      rating_scope,
      match_source
    )
    values (
      v_rating_user_id,
      v_match.tournament_id,
      p_match_id,
      coalesce((v_rating ->> 'ratingBefore')::integer, 1000),
      coalesce((v_rating ->> 'ratingAfter')::integer, 1000),
      v_rating_delta,
      coalesce(v_rating ->> 'reason', 'match_win'),
      v_rating_scope,
      coalesce(v_rating ->> 'matchSource', 'tournament')
    );

    if v_rating_scope = 'tournament' then
      update public.profiles
      set
        rating = greatest(100, coalesce(rating, 1000) + v_rating_delta),
        tournament_rating = greatest(100, coalesce(tournament_rating, rating, 1000) + v_rating_delta)
      where id = v_rating_user_id;
    elsif v_rating_scope = 'general' then
      update public.profiles
      set casual_rating = greatest(100, coalesce(casual_rating, rating, 1000) + v_rating_delta)
      where id = v_rating_user_id;
    elsif v_rating_scope = 'soft' then
      update public.profiles
      set soft_rating = greatest(100, coalesce(soft_rating, rating, 1000) + v_rating_delta)
      where id = v_rating_user_id;
    else
      raise exception 'Unsupported rating scope: %', v_rating_scope;
    end if;
  end loop;

  for v_stat in
    select value from jsonb_array_elements(coalesce(p_stat_events, '[]'::jsonb))
  loop
    v_stat_user_id := (v_stat ->> 'userId')::uuid;
    v_stats_scope := coalesce(v_stat ->> 'statsScope', 'tournament');
    v_average_score_samples := coalesce((v_stat ->> 'averageScoreSamples')::integer, 0);
    v_average_mpr_samples := coalesce((v_stat ->> 'averageMprSamples')::integer, 0);

    perform public.ensure_match_user_stat_baseline(v_stat_user_id, v_stats_scope);

    insert into public.match_user_stat_events (
      match_id,
      user_id,
      stats_scope,
      matches_played,
      wins,
      losses,
      legs_played,
      legs_won,
      legs_lost,
      total_scored_points,
      total_darts,
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
      average_score_total,
      average_score_samples,
      average_mpr_total,
      average_mpr_samples,
      count_ton80,
      count_hat_trick,
      count_white_horse,
      total_marks,
      count_5_marks,
      count_6_marks,
      count_7_marks
    )
    values (
      p_match_id,
      v_stat_user_id,
      v_stats_scope,
      1,
      case when coalesce((v_stat ->> 'won')::boolean, false) then 1 else 0 end,
      case when coalesce((v_stat ->> 'won')::boolean, false) then 0 else 1 end,
      coalesce((v_stat ->> 'legsWon')::integer, 0) + coalesce((v_stat ->> 'legsLost')::integer, 0),
      coalesce((v_stat ->> 'legsWon')::integer, 0),
      coalesce((v_stat ->> 'legsLost')::integer, 0),
      coalesce((v_stat ->> 'totalScoredPoints')::integer, 0),
      coalesce((v_stat ->> 'totalDarts')::integer, 0),
      coalesce((v_stat ->> 'highestTurnScore')::integer, 0),
      coalesce((v_stat ->> 'bustCount')::integer, 0),
      coalesce((v_stat ->> 'checkoutCount')::integer, 0),
      coalesce((v_stat ->> 'highestCheckout')::integer, 0),
      coalesce((v_stat ->> 'countHighCheckout')::integer, 0),
      coalesce((v_stat ->> 'count60Plus')::integer, 0),
      coalesce((v_stat ->> 'count80Plus')::integer, 0),
      coalesce((v_stat ->> 'count180')::integer, 0),
      coalesce((v_stat ->> 'count100Plus')::integer, 0),
      coalesce((v_stat ->> 'count140Plus')::integer, 0),
      coalesce((v_stat ->> 'count170Plus')::integer, 0),
      case when v_average_score_samples > 0 then coalesce((v_stat ->> 'averageScore')::numeric, 0) else 0 end,
      v_average_score_samples,
      case when v_average_mpr_samples > 0 then coalesce((v_stat ->> 'averageMpr')::numeric, 0) else 0 end,
      v_average_mpr_samples,
      coalesce((v_stat ->> 'countTon80')::integer, 0),
      coalesce((v_stat ->> 'countHatTrick')::integer, 0),
      coalesce((v_stat ->> 'countWhiteHorse')::integer, 0),
      coalesce((v_stat ->> 'totalMarks')::integer, 0),
      coalesce((v_stat ->> 'count5Marks')::integer, 0),
      coalesce((v_stat ->> 'count6Marks')::integer, 0),
      coalesce((v_stat ->> 'count7Marks')::integer, 0)
    );

    perform public.refresh_match_user_stats_from_events(v_stat_user_id, v_stats_scope);
  end loop;

  if p_winner_participant_id is not null
    and v_match.stage = 'knockout'
    and v_match.next_match_id is not null
    and v_match.next_match_slot is not null
  then
    update public.matches
    set
      participant_a_id = case when v_match.next_match_slot = 'A' then p_winner_participant_id else participant_a_id end,
      participant_b_id = case when v_match.next_match_slot = 'B' then p_winner_participant_id else participant_b_id end
    where id = v_match.next_match_id;
  end if;

  insert into public.match_settlements (
    match_id,
    submission_id,
    details,
    settled_at,
    recalculated_at
  )
  values (
    p_match_id,
    v_submission_uuid,
    coalesce(p_details, '{}'::jsonb),
    now(),
    case when p_recalculate then now() else null end
  )
  on conflict (match_id) do update set
    submission_id = excluded.submission_id,
    details = excluded.details,
    settled_at = excluded.settled_at,
    recalculated_at = case when p_recalculate then now() else public.match_settlements.recalculated_at end,
    updated_at = now();

  return jsonb_build_object(
    'status',
    case when p_recalculate then 'recalculated' else 'settled' end,
    'matchId',
    p_match_id
  );
end;
$$;

revoke execute on function public.ensure_match_user_stat_baseline(uuid, text)
from public, anon, authenticated;

revoke execute on function public.refresh_match_user_stats_from_events(uuid, text)
from public, anon, authenticated;

revoke execute on function public.settle_tournament_match(
  uuid,
  uuid,
  integer,
  integer,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  boolean
) from public, anon, authenticated;

grant execute on function public.ensure_match_user_stat_baseline(uuid, text)
to service_role;

grant execute on function public.refresh_match_user_stats_from_events(uuid, text)
to service_role;

grant execute on function public.settle_tournament_match(
  uuid,
  uuid,
  integer,
  integer,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  uuid,
  boolean
) to service_role;
