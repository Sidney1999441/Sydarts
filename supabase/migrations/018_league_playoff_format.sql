alter table public.tournaments
  drop constraint if exists tournaments_format_check,
  add constraint tournaments_format_check
    check (format in ('round_robin', 'single_elimination', 'double_elimination', 'league_playoff'));

