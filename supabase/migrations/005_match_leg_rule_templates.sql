alter table public.tournaments
  add column if not exists match_rule_mode text not null default 'standard',
  add column if not exists match_leg_rules jsonb not null default '[]'::jsonb,
  add column if not exists match_finish_mode text not null default 'majority';

alter table public.tournaments
  drop constraint if exists tournaments_dart_game_check,
  add constraint tournaments_dart_game_check check (dart_game in (301, 501, 701)),
  drop constraint if exists tournaments_match_rule_mode_check,
  add constraint tournaments_match_rule_mode_check check (match_rule_mode in ('standard', 'custom_legs')),
  drop constraint if exists tournaments_match_finish_mode_check,
  add constraint tournaments_match_finish_mode_check check (match_finish_mode in ('majority', 'play_all'));

alter table public.matches
  add column if not exists leg_rules jsonb not null default '[]'::jsonb,
  add column if not exists match_finish_mode text not null default 'majority';

alter table public.matches
  drop constraint if exists matches_match_finish_mode_check,
  add constraint matches_match_finish_mode_check check (match_finish_mode in ('majority', 'play_all'));

alter table public.match_legs
  add column if not exists participant_mode text not null default 'doubles',
  add column if not exists dart_mode text not null default 'steel',
  add column if not exists game_variant text not null default '501',
  add column if not exists participant_a_user_ids uuid[] not null default '{}',
  add column if not exists participant_b_user_ids uuid[] not null default '{}';

alter table public.match_legs
  drop constraint if exists match_legs_starting_score_check,
  add constraint match_legs_starting_score_check check (starting_score in (301, 501, 701)),
  drop constraint if exists match_legs_participant_mode_check,
  add constraint match_legs_participant_mode_check check (participant_mode in ('singles', 'doubles', 'team')),
  drop constraint if exists match_legs_dart_mode_check,
  add constraint match_legs_dart_mode_check check (dart_mode in ('steel', 'soft'));

alter table public.match_turns
  add column if not exists leg_number integer not null default 1;

update public.matches m
set
  match_finish_mode = coalesce(t.match_finish_mode, 'majority'),
  leg_rules = case
    when jsonb_array_length(coalesce(m.leg_rules, '[]'::jsonb)) > 0 then m.leg_rules
    else jsonb_build_array(
      jsonb_build_object(
        'legNumber', 1,
        'participantMode',
          case
            when t.tournament_type = 'individual' or t.team_size = 1 then 'singles'
            when t.tournament_type = 'team' or t.team_size > 2 then 'team'
            else 'doubles'
          end,
        'dartMode', coalesce(m.dart_mode, 'steel'),
        'gameVariant', coalesce(m.game_variant, t.dart_game::text, '501')
      )
    )
  end
from public.tournaments t
where t.id = m.tournament_id;
