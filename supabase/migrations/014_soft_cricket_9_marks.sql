alter table public.soft_user_stats
  add column if not exists count_9_marks integer not null default 0;

create or replace function public.sync_soft_count_9_marks_from_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stat_row record;
  stat_user_id uuid;
  stat_delta integer;
  profile_rating integer;
begin
  if (TG_OP = 'UPDATE' or TG_OP = 'DELETE')
    and coalesce(OLD.details ->> 'dartMode', '') = 'soft'
  then
    for stat_row in
      select
        key as user_id,
        coalesce((value ->> 'count9Marks')::integer, 0) as count_9_marks
      from jsonb_each(coalesce(OLD.details -> 'userStats', '{}'::jsonb))
    loop
      stat_user_id := stat_row.user_id::uuid;
      stat_delta := coalesce(stat_row.count_9_marks, 0);

      if stat_delta > 0 then
        update public.soft_user_stats
        set
          count_9_marks = greatest(0, count_9_marks - stat_delta),
          updated_at = now()
        where user_id = stat_user_id;
      end if;
    end loop;
  end if;

  if (TG_OP = 'INSERT' or TG_OP = 'UPDATE')
    and coalesce(NEW.details ->> 'dartMode', '') = 'soft'
  then
    for stat_row in
      select
        key as user_id,
        coalesce((value ->> 'count9Marks')::integer, 0) as count_9_marks
      from jsonb_each(coalesce(NEW.details -> 'userStats', '{}'::jsonb))
    loop
      stat_user_id := stat_row.user_id::uuid;
      stat_delta := coalesce(stat_row.count_9_marks, 0);

      if stat_delta > 0 then
        select soft_rating into profile_rating
        from public.profiles
        where id = stat_user_id;

        insert into public.soft_user_stats (
          user_id,
          count_9_marks,
          current_rating,
          last_match_at
        )
        values (
          stat_user_id,
          stat_delta,
          coalesce(profile_rating, 1000),
          now()
        )
        on conflict (user_id) do update set
          count_9_marks = public.soft_user_stats.count_9_marks + excluded.count_9_marks,
          current_rating = coalesce(profile_rating, public.soft_user_stats.current_rating),
          last_match_at = now(),
          updated_at = now();
      end if;
    end loop;
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

drop trigger if exists match_settlements_sync_soft_count_9_marks on public.match_settlements;
create trigger match_settlements_sync_soft_count_9_marks
after insert or update or delete on public.match_settlements
for each row execute function public.sync_soft_count_9_marks_from_settlement();

revoke execute on function public.sync_soft_count_9_marks_from_settlement()
from public, anon, authenticated;

grant execute on function public.sync_soft_count_9_marks_from_settlement()
to service_role;
