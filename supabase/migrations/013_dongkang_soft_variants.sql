alter table public.tournaments
  drop constraint if exists tournaments_soft_game_check,
  add constraint tournaments_soft_game_check
    check (
      soft_game in (
        'soft_301',
        'soft_501',
        'soft_701',
        'soft_cricket',
        'soft_half_it',
        'soft_high_score',
        'snow_501',
        'snow_701'
      )
    );
