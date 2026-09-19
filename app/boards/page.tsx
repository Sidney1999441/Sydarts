import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chinaDate, chinaDay, addDays } from "@/lib/schedule/weekly";
import { BoardCalendar } from "@/components/tournament/BoardCalendar";
import { isOpaqueIdentifier } from "@/lib/scorer/display-names";

export const dynamic = "force-dynamic";
async function allRows<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query(from, from + 499);
    if (error || !data) throw new Error("预约日历暂时无法读取，请刷新重试。");
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

export default async function BoardCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tournament?: string }>;
}) {
  const params = await searchParams;
  const date =
    params.date &&
    /^\d{4}-\d{2}-\d{2}$/.test(params.date) &&
    Number.isFinite(chinaDay(params.date).getTime()) &&
    chinaDate(chinaDay(params.date)) === params.date
      ? params.date
      : chinaDate();
  const tournamentId = z.string().uuid().safeParse(params.tournament).success
    ? params.tournament!
    : "";
  const db = await createSupabaseServerClient();
  let content;
  try {
    const tournaments = await allRows((a, b) => {
      let query = db
        .from("tournaments")
        .select("id,name")
        .neq("status", "draft")
        .order("id");
      if (tournamentId) query = query.eq("id", tournamentId);
      return query.range(a, b);
    });
    const ids = tournaments.map((t) => t.id);
    const [boards, slots, reservations] = ids.length
      ? await Promise.all([
          allRows((a, b) =>
            db
              .from("tournament_boards")
              .select("*")
              .in("tournament_id", ids)
              .order("id")
              .range(a, b),
          ),
          allRows((a, b) =>
            db
              .from("tournament_board_time_slots")
              .select("*")
              .in("tournament_id", ids)
              .order("id")
              .range(a, b),
          ),
          allRows((a, b) =>
            db
              .from("match_board_reservations")
              .select("*")
              .in("tournament_id", ids)
              .eq("status", "active")
              .lt("reserved_start_at", addDays(chinaDay(date), 7).toISOString())
              .gt("reserved_end_at", chinaDay(date).toISOString())
              .order("id")
              .range(a, b),
          ),
        ])
      : [[], [], []];
    const matchIds = reservations.map((r) => r.match_id);
    const matches = matchIds.length
      ? await allRows((a, b) =>
          db
            .from("matches")
            .select("id,status,participant_a_id,participant_b_id")
            .in("id", matchIds)
            .order("id")
            .range(a, b),
        )
      : [];
    const participantIds = [
      ...new Set(
        matches
          .flatMap((m) => [m.participant_a_id, m.participant_b_id])
          .filter(Boolean),
      ),
    ];
    const participants = participantIds.length
      ? await allRows((a, b) =>
          db
            .from("tournament_participants")
            .select("id,display_name")
            .in("id", participantIds)
            .order("id")
            .range(a, b),
        )
      : [];
    const names = new Map(
      participants.map((p) => [
        p.id,
        isOpaqueIdentifier(p.display_name) ? "待确认选手" : p.display_name,
      ]),
    );
    content = (
      <BoardCalendar
        key={`${date}-${tournamentId}`}
        firstDate={date}
        tournamentId={tournamentId}
        boards={boards.map((board) => ({
          id: board.id,
          name: board.name,
          status: board.status,
          tournamentId: board.tournament_id,
          tournamentName:
            tournaments.find((t) => t.id === board.tournament_id)?.name ||
            "赛事",
          availableStartAt: board.available_start_at,
          availableEndAt: board.available_end_at,
          slots: slots
            .filter((s) => s.board_id === board.id)
            .map((s) => ({
              id: s.id,
              boardId: s.board_id,
              status: s.status,
              availableStartAt: s.available_start_at,
              availableEndAt: s.available_end_at,
              dailyStartTime: s.daily_start_time,
              dailyEndTime: s.daily_end_time,
            })),
        }))}
        reservations={reservations.map((r) => {
          const match = matches.find((m) => m.id === r.match_id);
          return {
            id: r.id,
            matchId: r.match_id,
            boardId: r.board_id,
            status: r.status,
            reservedStartAt: r.reserved_start_at,
            reservedEndAt: r.reserved_end_at,
            completed: match?.status === "completed",
            label: `${names.get(match?.participant_a_id) || "待定"} vs ${names.get(match?.participant_b_id) || "待定"}`,
          };
        })}
      />
    );
  } catch {
    content = (
      <p
        role="alert"
        className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"
      >
        预约日历暂时无法读取，请刷新重试。
      </p>
    );
  }
  return (
    <div className="grid min-w-0 gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-wire pb-4">
        <h1 className="text-2xl font-black">机台预约日历</h1>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-board"
        >
          <ArrowLeft className="h-4 w-4" />
          赛事工作区
        </Link>
      </header>
      {content}
    </div>
  );
}
