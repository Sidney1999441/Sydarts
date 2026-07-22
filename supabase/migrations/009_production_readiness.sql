grant usage on schema public to anon, authenticated;

grant select on public.site_theme_settings to anon, authenticated;
grant select on public.tournaments to anon, authenticated;
grant select on public.teams to anon, authenticated;
grant select on public.team_members to anon, authenticated;
grant select on public.tournament_participants to anon, authenticated;
grant select on public.groups to anon, authenticated;
grant select on public.group_members to anon, authenticated;
grant select on public.matches to anon, authenticated;
grant select on public.match_legs to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select on public.user_stats to authenticated;
grant select on public.general_user_stats to authenticated;
grant select on public.soft_user_stats to authenticated;
grant select on public.rating_logs to authenticated;

grant select, insert, update, delete on public.tournaments to authenticated;
grant select, insert, update, delete on public.tournament_registrations to authenticated;
grant select, insert, update, delete on public.saved_teams to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.tournament_participants to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.matches to authenticated;
grant select, insert on public.match_legs to authenticated;
grant select, insert on public.match_turns to authenticated;
grant select, insert, update on public.match_result_confirmations to authenticated;
grant select, insert, update on public.casual_matches to authenticated;
grant select, insert on public.casual_match_turns to authenticated;

create unique index if not exists match_legs_match_leg_number_uidx
on public.match_legs(match_id, leg_number);

create unique index if not exists match_turns_match_turn_number_uidx
on public.match_turns(match_id, turn_number);

create unique index if not exists rating_logs_match_user_scope_uidx
on public.rating_logs(match_id, user_id, rating_scope)
where match_id is not null;

create unique index if not exists rating_logs_casual_user_scope_uidx
on public.rating_logs(casual_match_id, user_id, rating_scope)
where casual_match_id is not null;

create unique index if not exists match_result_confirmations_submission_uidx
on public.match_result_confirmations((details->>'submissionId'))
where details->>'submissionId' is not null;

create unique index if not exists casual_matches_submission_uidx
on public.casual_matches((details->>'submissionId'))
where details->>'submissionId' is not null;

grant execute on function public.is_admin(uuid) to anon, authenticated;
grant execute on function public.is_tournament_member(uuid, uuid) to anon, authenticated;
grant execute on function public.is_match_member(uuid, uuid) to anon, authenticated;

revoke execute on function public.upsert_user_match_stats(
  uuid,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
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

revoke execute on function public.upsert_general_match_stats(
  uuid,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
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
  integer
) from public, anon, authenticated;

grant execute on function public.upsert_user_match_stats(
  uuid,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
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

grant execute on function public.upsert_general_match_stats(
  uuid,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
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
  integer
) to service_role;
