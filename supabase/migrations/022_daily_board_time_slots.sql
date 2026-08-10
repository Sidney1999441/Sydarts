alter table public.tournament_board_time_slots
  add column if not exists daily_start_time time without time zone,
  add column if not exists daily_end_time time without time zone;

update public.tournament_board_time_slots
set
  daily_start_time = coalesce(daily_start_time, (available_start_at at time zone 'Asia/Shanghai')::time),
  daily_end_time = coalesce(daily_end_time, (available_end_at at time zone 'Asia/Shanghai')::time)
where daily_start_time is null
   or daily_end_time is null;

alter table public.tournament_board_time_slots
  alter column daily_start_time set not null,
  alter column daily_end_time set not null;

alter table public.tournament_board_time_slots
  drop constraint if exists tournament_board_time_slots_daily_range_check;

alter table public.tournament_board_time_slots
  add constraint tournament_board_time_slots_daily_range_check
  check (daily_end_time > daily_start_time);

alter table public.tournament_board_time_slots
  drop constraint if exists tournament_board_time_slots_no_overlap;

drop trigger if exists tournament_board_time_slots_validate_daily on public.tournament_board_time_slots;
drop function if exists public.validate_tournament_board_time_slot_daily();

create function public.validate_tournament_board_time_slot_daily()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'active' and exists (
    select 1
    from public.tournament_board_time_slots slot
    where slot.board_id = new.board_id
      and slot.id <> new.id
      and slot.status = 'active'
      and new.daily_start_time < slot.daily_end_time
      and new.daily_end_time > slot.daily_start_time
  ) then
    raise exception 'Board daily time slot overlaps existing slot.';
  end if;

  return new;
end;
$$;

create trigger tournament_board_time_slots_validate_daily
before insert or update on public.tournament_board_time_slots
for each row execute function public.validate_tournament_board_time_slot_daily();

create index if not exists tournament_board_time_slots_daily_idx
on public.tournament_board_time_slots(board_id, daily_start_time, daily_end_time)
where status = 'active';

create or replace function public.validate_match_board_reservation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  board_row record;
  match_tournament_id uuid;
  has_time_slot boolean;
  reserved_start_local timestamp;
  reserved_end_local timestamp;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select *
    into board_row
  from public.tournament_boards
  where id = new.board_id;

  if not found then
    raise exception 'Board does not exist.';
  end if;

  if board_row.status <> 'active' then
    raise exception 'Board is not available.';
  end if;

  if board_row.tournament_id <> new.tournament_id then
    raise exception 'Board does not belong to this tournament.';
  end if;

  select tournament_id
    into match_tournament_id
  from public.matches
  where id = new.match_id;

  if match_tournament_id is null then
    raise exception 'Match does not exist.';
  end if;

  if match_tournament_id <> new.tournament_id then
    raise exception 'Match does not belong to this tournament.';
  end if;

  reserved_start_local := new.reserved_start_at at time zone 'Asia/Shanghai';
  reserved_end_local := new.reserved_end_at at time zone 'Asia/Shanghai';

  select exists (
    select 1
    from public.tournament_board_time_slots slot
    where slot.board_id = new.board_id
  ) into has_time_slot;

  if has_time_slot then
    if reserved_start_local::date <> reserved_end_local::date
       or not exists (
        select 1
        from public.tournament_board_time_slots slot
        where slot.board_id = new.board_id
          and slot.status = 'active'
          and reserved_start_local::time >= slot.daily_start_time
          and reserved_end_local::time <= slot.daily_end_time
      ) then
      raise exception 'Reservation is outside board available time.';
    end if;
  elsif new.reserved_start_at < board_row.available_start_at
     or new.reserved_end_at > board_row.available_end_at then
    raise exception 'Reservation is outside board available time.';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_tournament_board_time_slot_daily() from public, anon, authenticated;
revoke execute on function public.validate_match_board_reservation() from public, anon, authenticated;
