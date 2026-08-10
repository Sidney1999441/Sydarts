create extension if not exists btree_gist;

create table if not exists public.tournament_boards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name text not null,
  available_start_at timestamptz not null,
  available_end_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_boards_available_range_check check (available_end_at > available_start_at)
);

create table if not exists public.match_board_reservations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  board_id uuid not null references public.tournament_boards(id) on delete restrict,
  reserved_start_at timestamptz not null,
  reserved_end_at timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_board_reservations_range_check check (reserved_end_at > reserved_start_at)
);

create unique index if not exists tournament_boards_active_name_uidx
on public.tournament_boards(tournament_id, lower(name))
where status = 'active';

create unique index if not exists match_board_reservations_active_match_uidx
on public.match_board_reservations(match_id)
where status = 'active';

create index if not exists tournament_boards_tournament_idx
on public.tournament_boards(tournament_id);

create index if not exists match_board_reservations_tournament_idx
on public.match_board_reservations(tournament_id);

create index if not exists match_board_reservations_board_time_idx
on public.match_board_reservations(board_id, reserved_start_at, reserved_end_at)
where status = 'active';

alter table public.match_board_reservations
  drop constraint if exists match_board_reservations_no_overlap;

alter table public.match_board_reservations
  add constraint match_board_reservations_no_overlap
  exclude using gist (
    board_id with =,
    tstzrange(reserved_start_at, reserved_end_at, '[)') with &&
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

  if new.reserved_start_at < board_row.available_start_at
     or new.reserved_end_at > board_row.available_end_at then
    raise exception 'Reservation is outside board available time.';
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_boards_set_updated_at on public.tournament_boards;
create trigger tournament_boards_set_updated_at
before update on public.tournament_boards
for each row execute function public.set_updated_at();

drop trigger if exists match_board_reservations_set_updated_at on public.match_board_reservations;
create trigger match_board_reservations_set_updated_at
before update on public.match_board_reservations
for each row execute function public.set_updated_at();

drop trigger if exists match_board_reservations_validate on public.match_board_reservations;
create trigger match_board_reservations_validate
before insert or update on public.match_board_reservations
for each row execute function public.validate_match_board_reservation();

alter table public.tournament_boards enable row level security;
alter table public.match_board_reservations enable row level security;

drop policy if exists "boards read visible tournaments" on public.tournament_boards;
create policy "boards read visible tournaments"
on public.tournament_boards
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

drop policy if exists "boards admin write" on public.tournament_boards;
create policy "boards admin write"
on public.tournament_boards
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "reservations read visible tournaments" on public.match_board_reservations;
create policy "reservations read visible tournaments"
on public.match_board_reservations
for select
to anon, authenticated
using (
  public.is_admin()
  or public.is_match_member(auth.uid(), match_id)
  or exists (
    select 1
    from public.tournaments t
    where t.id = tournament_id and t.status <> 'draft'
  )
);

drop policy if exists "reservations create match members" on public.match_board_reservations;
create policy "reservations create match members"
on public.match_board_reservations
for insert
to authenticated
with check (public.is_admin() or public.is_match_member(auth.uid(), match_id));

drop policy if exists "reservations update match members" on public.match_board_reservations;
create policy "reservations update match members"
on public.match_board_reservations
for update
to authenticated
using (public.is_admin() or public.is_match_member(auth.uid(), match_id))
with check (public.is_admin() or public.is_match_member(auth.uid(), match_id));

drop policy if exists "reservations delete admin" on public.match_board_reservations;
create policy "reservations delete admin"
on public.match_board_reservations
for delete
to authenticated
using (public.is_admin());

grant select on public.tournament_boards to anon, authenticated;
grant select on public.match_board_reservations to anon, authenticated;
grant insert, update, delete on public.tournament_boards to authenticated;
grant insert, update, delete on public.match_board_reservations to authenticated;
grant all on public.tournament_boards to service_role;
grant all on public.match_board_reservations to service_role;
