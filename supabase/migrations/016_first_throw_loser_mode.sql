alter table public.tournaments
  add column if not exists first_throw_mode text;

alter table public.tournaments
  drop constraint if exists tournaments_first_throw_mode_check,
  add constraint tournaments_first_throw_mode_check
    check (first_throw_mode is null or first_throw_mode in ('alternate', 'winner', 'loser'));

alter table public.matches
  add column if not exists first_throw_mode text;

alter table public.matches
  drop constraint if exists matches_first_throw_mode_check,
  add constraint matches_first_throw_mode_check
    check (first_throw_mode is null or first_throw_mode in ('alternate', 'winner', 'loser'));
