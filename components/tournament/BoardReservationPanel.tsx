"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock3, MapPin, XCircle } from "lucide-react";
import {
  cancelMatchBoardReservationAction,
  reserveMatchBoardAction,
  type BoardReservationActionState
} from "@/lib/actions/board-reservations";
import { formatDateTime } from "@/lib/utils";
import { boardDayAvailability } from "@/lib/schedule/board-calendar";
import { chinaDate, chinaDay, addDays } from "@/lib/schedule/weekly";
import { Button } from "@/components/ui/Button";

export type BoardReservationBoard = {
  id: string;
  name: string;
  availableStartAt: string;
  availableEndAt: string;
  status: "active" | "disabled";
  slots?: BoardReservationSlot[];
};

export type BoardReservationSlot = {
  id: string;
  boardId: string;
  availableStartAt: string;
  availableEndAt: string;
  dailyStartTime?: string | null;
  dailyEndTime?: string | null;
  status: "active" | "disabled";
};

export type BoardReservationRow = {
  id: string;
  matchId: string;
  boardId: string;
  reservedStartAt: string;
  reservedEndAt: string;
  status: "active" | "cancelled";
};

const initialState: BoardReservationActionState = {
  ok: false,
  message: null,
  error: null
};

const BOOKING_WINDOW_DAYS = 7;

export function BoardReservationPanel({
  matchId,
  boards,
  reservations,
  currentReservation,
  canReserve
}: {
  matchId: string;
  boards: BoardReservationBoard[];
  reservations: BoardReservationRow[];
  currentReservation?: BoardReservationRow | null;
  canReserve: boolean;
}) {
  const router = useRouter();
  const [reserveState, reserveAction] = useActionState(reserveMatchBoardAction, initialState);
  const [cancelState, cancelAction] = useActionState(cancelMatchBoardReservationAction, initialState);
  const activeBoards = useMemo(
    () => boards.filter((board) => board.status === "active" && getActiveBoardSlots(board).length > 0),
    [boards]
  );
  const todayDateValue = toLocalDatePart(startOfLocalDay(new Date()));
  const maxDateValue = toLocalDatePart(addLocalDays(startOfLocalDay(new Date()), BOOKING_WINDOW_DAYS - 1));
  const currentReservationDate = currentReservation ? toLocalDatePart(new Date(currentReservation.reservedStartAt)) : null;
  const [selectedDate, setSelectedDate] = useState(() =>
    clampDateValue(currentReservationDate || todayDateValue, todayDateValue, maxDateValue)
  );

  useEffect(() => {
    if (reserveState.ok || cancelState.ok) router.refresh();
  }, [cancelState, reserveState, router]);

  useEffect(() => {
    setSelectedDate((value) => clampDateValue(value, todayDateValue, maxDateValue));
  }, [maxDateValue, todayDateValue]);

  useEffect(() => {
    if (currentReservationDate) {
      setSelectedDate(clampDateValue(currentReservationDate, todayDateValue, maxDateValue));
    }
  }, [currentReservationDate, maxDateValue, todayDateValue]);

  const boardById = useMemo(() => new Map(boards.map((board) => [board.id, board])), [boards]);
  const currentBoard = currentReservation ? boardById.get(currentReservation.boardId) : null;
  const quickSlots = useMemo(
    () =>
      activeBoards.map((board) => ({
        board,
        availableSlots: getActiveBoardSlots(board),
        slots: buildFreeSlotsForDate({
          board,
          reservations,
          currentMatchId: matchId,
          datePart: selectedDate
        })
      })),
    [activeBoards, matchId, reservations, selectedDate]
  );
  const selectedDateLabel = formatDateLabel(selectedDate);
  const isCurrentSlot = (boardId: string, slot: { startAt: string; endAt: string }) =>
    Boolean(
      currentReservation &&
        currentReservation.boardId === boardId &&
        new Date(currentReservation.reservedStartAt).getTime() === new Date(slot.startAt).getTime() &&
        new Date(currentReservation.reservedEndAt).getTime() === new Date(slot.endAt).getTime()
    );

  return (
    <details className="mt-3 rounded-lg border border-wire bg-field p-3">
      <summary className="cursor-pointer list-none">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-black text-board">
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{currentReservation ? "已预约赛道" : "预约赛道"}</span>
          </span>
          <span className="truncate text-xs font-bold text-muted">
            {currentReservation && currentBoard
              ? `${currentBoard.name} / ${formatReservationRange(currentReservation)}`
              : activeBoards.length > 0
                ? `${activeBoards.length} 台可选`
                : "暂无可预约机台"}
          </span>
        </div>
      </summary>

      <div className="mt-3 grid gap-3">
        {currentReservation && currentBoard ? (
          <div className="grid gap-3 rounded-lg border border-board/25 bg-white p-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-board/10 text-board">
                <MapPin className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-black uppercase text-board">当前预约</div>
                <div className="mt-0.5 truncate text-sm font-black text-ink">
                  {currentBoard.name} · {formatReservationRange(currentReservation)}
                </div>
                <div className="mt-1 text-xs font-semibold text-muted">
                  选择下方其他可用时段即可直接更改预约。
                </div>
              </div>
            </div>
            {canReserve ? (
              <form action={cancelAction}>
                <input type="hidden" name="match_id" value={matchId} />
                <Button type="submit" variant="secondary" pendingText="取消中" className="w-full sm:w-auto">
                  <XCircle className="h-4 w-4" aria-hidden />
                  取消预约
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}

        {!canReserve ? (
          <p className="rounded-lg bg-surface p-3 text-sm font-semibold text-muted">
            只有本场比赛选手或管理员可以预约机台。
          </p>
        ) : activeBoards.length === 0 ? (
          <p className="rounded-lg bg-surface p-3 text-sm font-semibold text-muted">
            管理员还没有为该赛事配置可使用机台。
          </p>
        ) : (
          <>
            <label className="grid gap-2 rounded-lg border border-board/15 bg-surface p-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <span>
                <span className="block text-sm font-black text-board">选择预约日期</span>
                <span className="mt-1 block text-xs font-semibold text-muted">
                  最多可提前预约 {BOOKING_WINDOW_DAYS} 天内的机台，下面只显示当天可预约时段。
                </span>
              </span>
              <input
                className="form-input h-11 w-full sm:w-48"
                type="date"
                value={selectedDate}
                min={todayDateValue}
                max={maxDateValue}
                onChange={(event) =>
                  setSelectedDate(clampDateValue(event.target.value, todayDateValue, maxDateValue))
                }
              />
            </label>

            <div className="grid gap-3">
              {quickSlots.map(({ board, availableSlots, slots }) => {
                const visibleSlots = slots.filter((slot) => !isCurrentSlot(board.id, slot));
                return (
                  <div key={board.id} className="grid gap-3 rounded-lg bg-surface p-3">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-base font-black">{board.name}</div>
                      <div className="mt-0.5 text-xs font-semibold text-muted">
                        每日开放 {availableSlots.length} 段 · {selectedDateLabel} 可约
                      </div>
                    </div>
                    <span className="rounded-full bg-board/10 px-3 py-1 text-xs font-black text-board">
                      {currentReservation ? "点选改约" : "点选预约"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {availableSlots.slice(0, 4).map((slot) => (
                      <span key={slot.id} className="rounded-full bg-field px-2 py-1 text-[11px] font-black text-muted">
                        每天 {formatDailySlotRange(slot)}
                      </span>
                    ))}
                    {availableSlots.length > 4 ? (
                      <span className="rounded-full bg-field px-2 py-1 text-[11px] font-black text-muted">
                        +{availableSlots.length - 4}
                      </span>
                    ) : null}
                  </div>
                    {visibleSlots.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {visibleSlots.map((slot) => (
                        <form key={`${board.id}-${slot.startAt}`} action={reserveAction}>
                          <input type="hidden" name="match_id" value={matchId} />
                          <input type="hidden" name="board_id" value={board.id} />
                          <input type="hidden" name="reserved_start_at" value={slot.startAt} />
                          <button
                            className="grid min-h-14 w-full touch-manipulation place-items-center rounded-lg border border-board/20 bg-board/10 px-2 text-center text-xs font-black text-board active:bg-board/20"
                            type="submit"
                          >
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3.5 w-3.5" aria-hidden />
                              {formatTimeRange(slot.startAt, slot.endAt)}
                            </span>
                            <span className="mt-0.5 text-[11px] text-muted">
                              {currentReservation ? "更改到此时段" : "预约此时段"}
                            </span>
                          </button>
                        </form>
                        ))}
                    </div>
                  ) : (
                    <p className="rounded-lg bg-field p-3 text-xs font-semibold text-muted">
                      该机台在 {selectedDateLabel} 暂无可预约的一小时空档。
                    </p>
                  )}
                </div>
                );
              })}
            </div>
          </>
        )}

        <ActionMessage state={reserveState} />
        <ActionMessage state={cancelState} />
      </div>
    </details>
  );
}

export function MatchBoardReservationBadge({
  reservation,
  board
}: {
  reservation?: BoardReservationRow | null;
  board?: BoardReservationBoard | null;
}) {
  if (!reservation || !board) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-field px-2 py-1 text-xs font-black text-muted">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        待预约
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-board/10 px-2 py-1 text-xs font-black text-board">
      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{board.name} · {formatReservationRange(reservation)}</span>
    </span>
  );
}

function ActionMessage({ state }: { state: BoardReservationActionState }) {
  if (state.error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700" role="status">
        {state.message}
      </p>
    );
  }
  return null;
}

function buildFreeSlotsForDate({ board, reservations, currentMatchId, datePart }: {
  board: BoardReservationBoard;
  reservations: BoardReservationRow[];
  currentMatchId: string;
  datePart: string;
}) {
  return boardDayAvailability(board, datePart, reservations, new Date(), currentMatchId).free;
}

function getActiveBoardSlots(board: BoardReservationBoard): BoardReservationSlot[] {
  const allSlots = board.slots || [];
  const explicitSlots = allSlots
    .filter((slot) => slot.status === "active")
    .sort((a, b) => new Date(a.availableStartAt).getTime() - new Date(b.availableStartAt).getTime());

  if (explicitSlots.length > 0) return explicitSlots;
  if (allSlots.length > 0) return [];
  if (!board.availableStartAt || !board.availableEndAt) return [];

  return [
    {
      id: `legacy-${board.id}`,
      boardId: board.id,
      availableStartAt: board.availableStartAt,
      availableEndAt: board.availableEndAt,
      dailyStartTime: null,
      dailyEndTime: null,
      status: "active"
    }
  ];
}

function formatDailySlotRange(slot: BoardReservationSlot) {
  if (slot.dailyStartTime && slot.dailyEndTime) {
    return `${formatDailyTime(slot.dailyStartTime)}-${formatDailyTime(slot.dailyEndTime)}`;
  }
  return formatTimeRange(slot.availableStartAt, slot.availableEndAt);
}

function formatDailyTime(time: string) {
  return time.slice(0, 5);
}

function normalizeDailyTime(time: string) {
  return time.length === 5 ? `${time}:00` : time;
}

function startOfLocalDay(date: Date) {
  return chinaDay(chinaDate(date));
}

function addLocalDays(date: Date, days: number) {
  return addDays(date, days);
}

function toLocalDatePart(date: Date) {
  return chinaDate(date);
}

function combineLocalDateAndTime(datePart: string, time: string) {
  return new Date(`${datePart}T${normalizeDailyTime(time)}+08:00`);
}

function clampDateValue(datePart: string, minDatePart: string, maxDatePart: string) {
  if (datePart < minDatePart) return minDatePart;
  if (datePart > maxDatePart) return maxDatePart;
  return datePart;
}

function formatReservationRange(reservation: BoardReservationRow) {
  return formatTimeRange(reservation.reservedStartAt, reservation.reservedEndAt);
}

function formatTimeRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const sameDay = chinaDate(start) === chinaDate(end);
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit"
  });

  return sameDay ? `${dateFormatter.format(start)}-${timeFormatter.format(end)}` : `${formatDateTime(startAt)}-${formatDateTime(endAt)}`;
}

function formatDateLabel(datePart: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(combineLocalDateAndTime(datePart, "00:00:00"));
}
