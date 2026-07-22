grant all on public.match_settlements to service_role;
grant all on public.match_user_stat_baselines to service_role;
grant all on public.match_user_stat_events to service_role;

drop policy if exists "settlements service role access" on public.match_settlements;
create policy "settlements service role access"
on public.match_settlements
for all
to service_role
using (true)
with check (true);

drop policy if exists "stat baselines service role access" on public.match_user_stat_baselines;
create policy "stat baselines service role access"
on public.match_user_stat_baselines
for all
to service_role
using (true)
with check (true);

drop policy if exists "stat events service role access" on public.match_user_stat_events;
create policy "stat events service role access"
on public.match_user_stat_events
for all
to service_role
using (true)
with check (true);
