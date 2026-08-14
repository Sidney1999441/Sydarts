import { CalendarRange, MapPin } from "lucide-react";
import {
  deactivateTournamentBoardAction,
  deactivateTournamentBoardSlotAction,
  saveTournamentBoardAction,
  saveTournamentBoardSlotAction
} from "@/lib/actions/board-reservations";
import { generateGroupsAndScheduleAction, generateLeaguePlayoffsAction } from "@/lib/actions/tournaments";
import { calculatePlayerLevel } from "@/lib/algorithms/player-level";
import { requireAdmin } from "@/lib/auth/guards";
import { getDartModeLabel, getMatchRulesSummary } from "@/lib/darts/variants";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import {
  MatchBoardReservationBadge,
  type BoardReservationBoard,
  type BoardReservationRow,
  type BoardReservationSlot
} from "@/components/tournament/BoardReservationPanel";
import { SetupNotice } from "@/components/SetupNotice";
import { CodlPageHeader } from "@/components/CodlPageHeader";
import { TournamentBracket } from "@/components/TournamentBracket";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { MatchBoardReservation, Tournament, TournamentBoard, TournamentBoardTimeSlot } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function ScheduleAdminPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!hasSupabaseEnv()) return <SetupNotice />;
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [
    { data: tournament },
    { data: participants },
    { data: groups },
    { data: groupMembers },
    { data: matches },
    { data: boards },
    { data: boardSlots },
    { data: reservations }
  ] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).single(),
      supabase.from("tournament_participants").select("*").eq("tournament_id", id).order("seed"),
      supabase.from("groups").select("*").eq("tournament_id", id).order("group_index"),
      supabase.from("group_members").select("*"),
      supabase.from("matches").select("*").eq("tournament_id", id).order("round_number").order("match_number"),
      supabase.from("tournament_boards").select("*").eq("tournament_id", id).order("available_start_at"),
      supabase.from("tournament_board_time_slots").select("*").eq("tournament_id", id).order("daily_start_time"),
      supabase
        .from("match_board_reservations")
        .select("*")
        .eq("tournament_id", id)
        .eq("status", "active")
        .order("reserved_start_at")
    ]);
  const participantById = new Map((participants || []).map((participant) => [participant.id, participant]));
  const levelFromRating = (rating?: number | null) => calculatePlayerLevel({ rating: rating || 1000 }).level;
  const groupMatches = (matches || []).filter((match) => match.stage === "group");
  const knockoutMatches = (matches || []).filter((match) => match.stage === "knockout");
  const isLeaguePlayoff = tournament?.format === "league_playoff";
  const tournamentData = tournament as Tournament | null;
  const boardRows = (boards || []) as TournamentBoard[];
  const boardSlotRows = (boardSlots || []) as TournamentBoardTimeSlot[];
  const reservationRows = (reservations || []) as MatchBoardReservation[];
  const slotsByBoardId = groupBoardSlots(boardSlotRows);
  const boardById = new Map(boardRows.map((board) => [board.id, board]));
  const reservationByMatchId = new Map(reservationRows.map((reservation) => [reservation.match_id, reservation]));

  return (
    <div className="grid gap-6">
      <CodlPageHeader
        kicker="CODL Admin"
        title="分组与赛程"
        description={`${tournament?.name} / ${tournament?.format} / 当前参赛主体 ${(participants || []).length}`}
        icon={<CalendarRange className="h-6 w-6" aria-hidden />}
        art="white"
      />
      <Card>
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <form action={generateGroupsAndScheduleAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tournament_id" value={id} />
            <label className="label w-40">
              分组数量
              <input
                className="form-input"
                type="number"
                min={1}
                name="group_count"
                defaultValue={isLeaguePlayoff ? 1 : 2}
                disabled={isLeaguePlayoff}
              />
            </label>
            {isLeaguePlayoff ? <input type="hidden" name="group_count" value={1} /> : null}
            <Button type="submit">
              {isLeaguePlayoff ? "生成联赛赛程" : "自动分组并生成赛程"}
            </Button>
          </form>
          {isLeaguePlayoff ? (
            <form action={generateLeaguePlayoffsAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="tournament_id" value={id} />
              <Button type="submit" variant="secondary">根据当前排名生成季后赛</Button>
            </form>
          ) : null}
        </div>
        {isLeaguePlayoff ? (
          <p className="mt-3 text-sm font-semibold text-muted">
            复合赛制先生成一个整体联赛；联赛结果录入后，再按排名生成季后赛：1-2 名进四强，5v8、6v7，胜者分别挑战 4、3，争夺另外两个四强席位。
          </p>
        ) : null}
      </Card>
      {tournamentData ? (
        <TournamentBoardAdminPanel
          tournament={tournamentData}
          boards={boardRows}
          boardSlots={boardSlotRows}
          reservations={reservationRows}
        />
      ) : null}
      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <h2 className="text-lg font-bold">分组</h2>
          <div className="mt-4 grid gap-3">
            {(groups || []).map((group) => {
              const members = (groupMembers || [])
                .filter((member) => member.group_id === group.id)
                .map((member) => participantById.get(member.participant_id))
                .filter(Boolean);
              return (
                <div key={group.id} className="rounded-lg border border-wire p-4">
                  <div className="font-bold">{group.name} 组</div>
                  <ul className="mt-2 grid gap-1 text-sm text-muted">
                    {members.map((member) => (
                      <li key={member.id}>{member.display_name} / Lv.{levelFromRating(member.rating_snapshot)}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {(groups || []).length === 0 ? <p className="text-sm text-muted">暂无分组。</p> : null}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold">{isLeaguePlayoff ? "联赛对阵" : "对阵"}</h2>
          <div className="mt-4 grid gap-3">
            {(isLeaguePlayoff ? groupMatches : matches || []).map((match) => {
              const reservation = reservationByMatchId.get(match.id);
              const board = boardById.get(reservation?.board_id || "");
              return (
                <div key={match.id} className="rounded-lg border border-wire p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <DartModeBadge dartMode={match.dart_mode} />
                      <div className="font-semibold text-muted">
                        {match.stage} / R{match.round_number} M{match.match_number} / {match.status}
                      </div>
                    </div>
                    <MatchBoardReservationBadge
                      reservation={toReservationView(reservation)}
                      board={toBoardView(board, slotsByBoardId.get(board?.id || ""))}
                    />
                  </div>
                  <div className="mt-1 text-xs font-semibold text-board">
                    {getMatchRulesSummary({
                      dartMode: match.dart_mode,
                      gameVariant: match.game_variant,
                      legRules: match.leg_rules
                    })}
                  </div>
                  <div className="mt-1 font-bold">
                    {participantById.get(match.participant_a_id)?.display_name || "TBD"} vs {participantById.get(match.participant_b_id)?.display_name || "TBD"}
                  </div>
                </div>
              );
            })}
            {(isLeaguePlayoff ? groupMatches : matches || []).length === 0 ? <p className="text-sm text-muted">暂无赛程。</p> : null}
          </div>
        </Card>
      </section>
      {knockoutMatches.length > 0 || tournament?.format === "single_elimination" || isLeaguePlayoff ? (
        <Card>
          <TournamentBracket
            title={isLeaguePlayoff ? "季后赛树状对阵" : "淘汰赛树状对阵"}
            matches={knockoutMatches}
            participants={(participants || []).map((participant) => ({
              id: participant.id,
              display_name: participant.display_name
            }))}
            manualEdit={{
              tournamentId: id,
              participants: (participants || []).map((participant) => ({
                id: participant.id,
                display_name: participant.display_name
              }))
            }}
          />
        </Card>
      ) : null}
    </div>
  );
}

function DartModeBadge({ dartMode }: { dartMode?: string | null }) {
  const isSoft = dartMode === "soft";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ${isSoft ? "bg-sky-100 text-board ring-1 ring-sky-200" : "bg-zinc-900 text-white"}`}>
      {getDartModeLabel(dartMode)}
    </span>
  );
}

function TournamentBoardAdminPanel({
  tournament,
  boards,
  boardSlots,
  reservations
}: {
  tournament: Tournament;
  boards: TournamentBoard[];
  boardSlots: TournamentBoardTimeSlot[];
  reservations: MatchBoardReservation[];
}) {
  const defaultStart = tournament.tournament_start_at;
  const defaultStartTime = toTimeInputFromIso(defaultStart);
  const defaultEndTime = toTimeInputFromIso(new Date(new Date(defaultStart).getTime() + 60 * 60 * 1000).toISOString());
  const slotsByBoardId = groupBoardSlots(boardSlots);
  const activeReservationsByBoardId = new Map<string, MatchBoardReservation[]>();
  for (const reservation of reservations) {
    const list = activeReservationsByBoardId.get(reservation.board_id) || [];
    list.push(reservation);
    activeReservationsByBoardId.set(reservation.board_id, list);
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <MapPin className="h-5 w-5 text-board" aria-hidden />
        <h2 className="text-lg font-black">赛道/机台</h2>
      </div>
      <p className="mt-2 text-sm font-semibold text-muted">
        每台机可以设置多个每日可用时段；预约必须完整落在其中一个时段内。同一机台同一时间段不会被重复预约，默认每场 1 小时。
      </p>

      <form action={saveTournamentBoardAction} className="mt-4 grid gap-3 rounded-lg border border-wire bg-field p-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <input type="hidden" name="tournament_id" value={tournament.id} />
        <label className="label">
          机台名称
          <input className="form-input" name="name" placeholder="例：1号赛道 / DARTSLIVE 1" required />
        </label>
        <label className="label">
          每日开始
          <input className="form-input" type="time" name="daily_start_time" defaultValue={defaultStartTime} required />
        </label>
        <label className="label">
          每日结束
          <input className="form-input" type="time" name="daily_end_time" defaultValue={defaultEndTime} required />
        </label>
        <Button type="submit" pendingText="保存中" className="w-full lg:w-auto">
          新增机台
        </Button>
      </form>

      <div className="mt-4 grid gap-3">
        {boards.map((board) => {
          const reservationsForBoard = activeReservationsByBoardId.get(board.id) || [];
          const slotsForBoard = slotsByBoardId.get(board.id) || [];
          const activeSlotsForBoard = slotsForBoard.filter((slot) => slot.status === "active");
          return (
            <div key={board.id} className="grid gap-3 rounded-lg border border-wire bg-surface p-3">
              <form action={saveTournamentBoardAction} className="grid gap-3 lg:grid-cols-[1fr_150px_auto] lg:items-end">
                <input type="hidden" name="tournament_id" value={tournament.id} />
                <input type="hidden" name="board_id" value={board.id} />
                <label className="label">
                  名称
                  <input className="form-input" name="name" defaultValue={board.name} required />
                </label>
                <label className="label">
                  状态
                  <select className="form-input" name="status" defaultValue={board.status}>
                    <option value="active">可预约</option>
                    <option value="disabled">停用</option>
                  </select>
                </label>
                <Button type="submit" variant="secondary" pendingText="保存中" className="w-full lg:w-auto">
                  保存
                </Button>
              </form>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="text-xs font-semibold text-muted">
                  每日可用时段 {activeSlotsForBoard.length} 段
                  {reservationsForBoard.length > 0 ? ` / 已预约 ${reservationsForBoard.length} 场` : " / 暂无预约"}
                </div>
                {board.status === "active" ? (
                  <form action={deactivateTournamentBoardAction}>
                    <input type="hidden" name="tournament_id" value={tournament.id} />
                    <input type="hidden" name="board_id" value={board.id} />
                    <Button type="submit" variant="ghost" pendingText="停用中" className="w-full text-muted sm:w-auto">
                      停用
                    </Button>
                  </form>
                ) : (
                  <span className="rounded-full bg-field px-3 py-2 text-center text-xs font-black text-muted">已停用</span>
                )}
              </div>
              {activeSlotsForBoard.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {activeSlotsForBoard.map((slot) => (
                    <span key={slot.id} className="rounded-full bg-board/10 px-2 py-1 text-xs font-black text-board">
                      每天 {formatDailySlotRange(slot)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg bg-field p-3 text-xs font-semibold text-muted">
                  这台机暂无启用的可用时段，选手暂时不能预约。
                </p>
              )}
              <div className="grid gap-3 rounded-lg border border-wire bg-field p-3">
                <div className="text-sm font-black text-board">每日可用时段</div>
                <form action={saveTournamentBoardSlotAction} className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                  <input type="hidden" name="tournament_id" value={tournament.id} />
                  <input type="hidden" name="board_id" value={board.id} />
                  <label className="label">
                    新时段开始
                    <input className="form-input" type="time" name="daily_start_time" defaultValue={defaultStartTime} required />
                  </label>
                  <label className="label">
                    新时段结束
                    <input className="form-input" type="time" name="daily_end_time" defaultValue={defaultEndTime} required />
                  </label>
                  <Button type="submit" pendingText="添加中" className="w-full lg:w-auto">
                    添加时段
                  </Button>
                </form>
                <div className="grid gap-2">
                  {slotsForBoard.map((slot) => (
                    <div key={slot.id} className="grid gap-2 rounded-lg border border-wire bg-surface p-3">
                      <form action={saveTournamentBoardSlotAction} className="grid gap-3 lg:grid-cols-[1fr_1fr_120px_auto] lg:items-end">
                        <input type="hidden" name="tournament_id" value={tournament.id} />
                        <input type="hidden" name="board_id" value={board.id} />
                        <input type="hidden" name="slot_id" value={slot.id} />
                        <label className="label">
                          开始
                          <input className="form-input" type="time" name="daily_start_time" defaultValue={toTimeInput(slot.daily_start_time)} required />
                        </label>
                        <label className="label">
                          结束
                          <input className="form-input" type="time" name="daily_end_time" defaultValue={toTimeInput(slot.daily_end_time)} required />
                        </label>
                        <label className="label">
                          状态
                          <select className="form-input" name="status" defaultValue={slot.status}>
                            <option value="active">启用</option>
                            <option value="disabled">停用</option>
                          </select>
                        </label>
                        <Button type="submit" variant="secondary" pendingText="保存中" className="w-full lg:w-auto">
                          保存时段
                        </Button>
                      </form>
                      {slot.status === "active" ? (
                        <form action={deactivateTournamentBoardSlotAction} className="flex justify-end">
                          <input type="hidden" name="tournament_id" value={tournament.id} />
                          <input type="hidden" name="board_id" value={board.id} />
                          <input type="hidden" name="slot_id" value={slot.id} />
                          <Button type="submit" variant="ghost" pendingText="停用中" className="w-full text-muted sm:w-auto">
                            停用时段
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                  {slotsForBoard.length === 0 ? (
                    <p className="rounded-lg bg-surface p-3 text-xs font-semibold text-muted">
                      暂无时段。至少添加一段后，这台机才会出现在选手预约列表里。
                    </p>
                  ) : null}
                </div>
              </div>
              {reservationsForBoard.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {reservationsForBoard.slice(0, 6).map((reservation) => (
                    <span key={reservation.id} className="rounded-full bg-board/10 px-2 py-1 text-xs font-black text-board">
                      {formatDateTime(reservation.reserved_start_at)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {boards.length === 0 ? (
          <p className="rounded-lg bg-field p-3 text-sm font-semibold text-muted">
            暂未配置机台。新增后，选手就可以在赛程里预约空闲时间。
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function groupBoardSlots(slots: TournamentBoardTimeSlot[]) {
  const slotsByBoardId = new Map<string, TournamentBoardTimeSlot[]>();
  for (const slot of slots) {
    const list = slotsByBoardId.get(slot.board_id) || [];
    list.push(slot);
    slotsByBoardId.set(slot.board_id, list);
  }
  return slotsByBoardId;
}

function toBoardView(board?: TournamentBoard | null, slots: TournamentBoardTimeSlot[] = []): BoardReservationBoard | null {
  if (!board) return null;
  return {
    id: board.id,
    name: board.name,
    availableStartAt: board.available_start_at,
    availableEndAt: board.available_end_at,
    status: board.status,
    slots: slots.map(toBoardSlotView)
  };
}

function toBoardSlotView(slot: TournamentBoardTimeSlot): BoardReservationSlot {
  return {
    id: slot.id,
    boardId: slot.board_id,
    availableStartAt: slot.available_start_at,
    availableEndAt: slot.available_end_at,
    dailyStartTime: slot.daily_start_time,
    dailyEndTime: slot.daily_end_time,
    status: slot.status
  };
}

function formatDailySlotRange(slot: TournamentBoardTimeSlot) {
  return `${toTimeInput(slot.daily_start_time)}-${toTimeInput(slot.daily_end_time)}`;
}

function toTimeInput(time?: string | null) {
  if (!time) return "";
  return time.slice(0, 5);
}

function toTimeInputFromIso(value: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return formatter.format(new Date(value));
}

function toReservationView(reservation?: MatchBoardReservation | null): BoardReservationRow | null {
  if (!reservation) return null;
  return {
    id: reservation.id,
    matchId: reservation.match_id,
    boardId: reservation.board_id,
    reservedStartAt: reservation.reserved_start_at,
    reservedEndAt: reservation.reserved_end_at,
    status: reservation.status
  };
}
