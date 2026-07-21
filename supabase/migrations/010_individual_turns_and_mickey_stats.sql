alter table public.match_turns
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

create index if not exists match_turns_user_idx on public.match_turns(user_id);

alter table public.soft_user_stats
  add column if not exists total_marks integer not null default 0,
  add column if not exists count_5_marks integer not null default 0,
  add column if not exists count_6_marks integer not null default 0,
  add column if not exists count_7_marks integer not null default 0;

drop function if exists public.upsert_soft_match_stats(
  uuid,
  boolean,
  integer,
  integer,
  numeric,
  numeric,
  integer,
  integer,
  integer,
  integer,
  integer
);

drop function if exists public.upsert_soft_match_stats(
  uuid,
  boolean,
  integer,
  integer,
  numeric,
  numeric,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
);

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
  p_count_white_horse integer default 0,
  p_total_marks integer default 0,
  p_count_5_marks integer default 0,
  p_count_6_marks integer default 0,
  p_count_7_marks integer default 0
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
    total_marks,
    count_5_marks,
    count_6_marks,
    count_7_marks,
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
    coalesce(p_total_marks, 0),
    coalesce(p_count_5_marks, 0),
    coalesce(p_count_6_marks, 0),
    coalesce(p_count_7_marks, 0),
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
    total_marks = public.soft_user_stats.total_marks + coalesce(p_total_marks, 0),
    count_5_marks = public.soft_user_stats.count_5_marks + coalesce(p_count_5_marks, 0),
    count_6_marks = public.soft_user_stats.count_6_marks + coalesce(p_count_6_marks, 0),
    count_7_marks = public.soft_user_stats.count_7_marks + coalesce(p_count_7_marks, 0),
    current_rating = coalesce(profile_rating, public.soft_user_stats.current_rating),
    last_match_at = now(),
    updated_at = now();
end;
$$;

revoke execute on function public.upsert_soft_match_stats(
  uuid,
  boolean,
  integer,
  integer,
  numeric,
  numeric,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.upsert_soft_match_stats(
  uuid,
  boolean,
  integer,
  integer,
  numeric,
  numeric,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) to service_role;
