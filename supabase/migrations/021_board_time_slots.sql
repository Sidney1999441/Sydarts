create extension if not exists btree_gist;

create table if not exists public.tournament_board_time_slots (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  board_id uuid not null references public.tournament_boards(id) on delete cascade,
  available_start_at timestamptz not null,
  available_end_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_board_time_slots_range_check check (available_end_at > available_start_at)
);

insert into public.tournament_board_time_slots (
  tournament_id,
  board_id,
  available_start_at,
  available_end_at,
  status
)
select
  board.tournament_id,
  board.id,
  board.available_start_at,
  board.available_end_at,
  board.status
from public.tournament_boards board
where board.available_end_at > board.available_start_at
  and not exists (
    select 1
    from public.tournament_board_time_slots slot
    where slot.board_id = board.id
  );

create index if not exists tournament_board_time_slots_tournament_idx
on public.tournament_board_time_slots(tournament_id);

create index if not exists tournament_board_time_slots_board_time_idx
on public.tournament_board_time_slots(board_id, available_start_at, available_end_at)
where status = 'active';

alter table public.tournament_board_time_slots
  drop constraint if exists tournament_board_time_slots_no_overlap;

alter table public.tournament_board_time_slots
  add constraint tournament_board_time_slots_no_overlap
  exclude using gist (
    board_id with =,
    tstzrange(available_start_at, available_end_at, '[)') with &&
  )
  where (status = 'active');

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

  select exists (
    select 1
    from public.tournament_board_time_slots slot
    where slot.board_id = new.board_id
  ) into has_time_slot;

  if has_time_slot then
    if not exists (
      select 1
      from public.tournament_board_time_slots slot
      where slot.board_id = new.board_id
        and slot.status = 'active'
        and new.reserved_start_at >= slot.available_start_at
        and new.reserved_end_at <= slot.available_end_at
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

drop trigger if exists tournament_board_time_slots_set_updated_at on public.tournament_board_time_slots;
create trigger tournament_board_time_slots_set_updated_at
before update on public.tournament_board_time_slots
for each row execute function public.set_updated_at();

alter table public.tournament_board_time_slots enable row level security;

drop policy if exists "board slots read visible tournaments" on public.tournament_board_time_slots;
create policy "board slots read visible tournaments"
on public.tournament_board_time_slots
for select
to anon, authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments t
    where t.id = tournament_id and t.status <> 'draft'
  )
);

drop policy if exists "board slots admin write" on public.tournament_board_time_slots;
create policy "board slots admin write"
on public.tournament_board_time_slots
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

grant select on public.tournament_board_time_slots to anon, authenticated;
grant insert, update, delete on public.tournament_board_time_slots to authenticated;
grant all on public.tournament_board_time_slots to service_role;

revoke execute on function public.validate_match_board_reservation() from public, anon, authenticated;
