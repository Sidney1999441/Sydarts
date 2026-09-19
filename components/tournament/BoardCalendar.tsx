"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { boardDayAvailability, chinaTime } from "@/lib/schedule/board-calendar";
import { addDays, chinaDate, chinaDay } from "@/lib/schedule/weekly";
import type {
  BoardReservationBoard,
  BoardReservationRow,
} from "@/components/tournament/BoardReservationPanel";

export type CalendarBoard = BoardReservationBoard & {
  tournamentId: string;
  tournamentName: string;
};
export type CalendarBooking = BoardReservationRow & {
  label: string;
  completed: boolean;
};

export function BoardCalendar({
  boards,
  reservations,
  firstDate,
  tournamentId,
}: {
  boards: CalendarBoard[];
  reservations: CalendarBooking[];
  firstDate: string;
  tournamentId: string;
}) {
  const router = useRouter();
  const [day, setDay] = useState(firstDate);
  const [boardId, setBoardId] = useState("");
  const days = Array.from({ length: 7 }, (_, i) =>
    chinaDate(addDays(chinaDay(firstDate), i)),
  );
  const visible = boards.filter((b) => !boardId || b.id === boardId);
  const [now, setNow] = useState(() => new Date());
  const navigate = (date: string) =>
    router.push(
      `/boards?date=${date}${tournamentId ? `&tournament=${tournamentId}` : ""}`,
    );
  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex w-full items-end gap-2 sm:w-auto">
          <button
            type="button"
            className="rounded-lg border border-wire bg-surface text-ink hover:bg-field h-11 w-11 shrink-0"
            title="前七天"
            aria-label="前七天"
            onClick={() =>
              navigate(chinaDate(addDays(chinaDay(firstDate), -7)))
            }
          >
            <ChevronLeft className="mx-auto h-5 w-5" />
          </button>
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold sm:w-44 sm:flex-none">
            日期
            <input
              aria-label="日历日期"
              className="form-input min-w-0"
              type="date"
              value={day}
              onChange={(e) => {
                if (e.target.value) navigate(e.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className="rounded-lg border border-wire bg-surface text-ink hover:bg-field h-11 w-11 shrink-0"
            title="后七天"
            aria-label="后七天"
            onClick={() => navigate(chinaDate(addDays(chinaDay(firstDate), 7)))}
          >
            <ChevronRight className="mx-auto h-5 w-5" />
          </button>
        </div>
        <button
          type="button"
          className="rounded-lg border border-wire bg-surface text-ink hover:bg-field min-h-11 px-3"
          onClick={() => navigate(chinaDate())}
        >
          今天
        </button>
        <button
          type="button"
          className="rounded-lg border border-wire bg-surface text-ink hover:bg-field h-11 w-11 shrink-0"
          title="刷新预约"
          aria-label="刷新预约"
          onClick={() => {
            setNow(new Date());
            router.refresh();
          }}
        >
          <RefreshCw className="mx-auto h-4 w-4" />
        </button>
        <label className="grid min-w-0 flex-1 gap-1 text-xs font-bold sm:ml-auto sm:w-60 sm:flex-none">
          机台
          <select
            className="form-input"
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
          >
            <option value="">全部机台</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.tournamentName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        role="tablist"
        aria-label="预约日期"
        className="grid grid-cols-7 border-b border-wire"
      >
        {days.map((date) => {
          const count = reservations.filter(
            (r) =>
              (!boardId || r.boardId === boardId) &&
              chinaDate(new Date(r.reservedStartAt)) === date,
          ).length;
          return (
            <button
              type="button"
              key={date}
              role="tab"
              aria-selected={day === date}
              className={`grid min-w-0 gap-1 border-b-2 px-0.5 py-3 text-center ${day === date ? "border-board bg-sky-50 text-board" : "border-transparent text-muted"}`}
              onClick={() => setDay(date)}
            >
              <span className="whitespace-nowrap text-[10px] sm:text-xs">
                {new Intl.DateTimeFormat("zh-CN", {
                  timeZone: "Asia/Shanghai",
                  weekday: "short",
                }).format(chinaDay(date))}
              </span>
              <strong className="text-base">{date.slice(8)}</strong>
              <span className="whitespace-nowrap text-[10px] sm:text-xs">
                {count} 场
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
        <span className="text-emerald-700">空闲</span>
        <span className="text-board">已预约</span>
        <span className="text-muted">北京时间 · {day}</span>
      </div>
      {visible.length === 0 ? (
        <p className="py-8 text-center text-muted">暂无可查看的机台</p>
      ) : (
        visible.map((board) => {
          const { busy, free } = boardDayAvailability(
            board,
            day,
            reservations,
            now,
          );
          return (
            <section
              key={board.id}
              className="min-w-0 border-b border-wire pb-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-black">
                  {board.name}
                  {board.status !== "active" ? "（已停用）" : ""}
                </h2>
                <Link
                  href={`/tournaments/${board.tournamentId}`}
                  className="break-words text-xs text-muted"
                >
                  {board.tournamentName}
                </Link>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {busy.map((r) => {
                  const booking = reservations.find(
                    (item) => item.id === r.id,
                  )!;
                  return (
                    <Link
                      key={r.id}
                      href={`/scorer/${r.matchId}`}
                      className="grid min-w-0 gap-1 rounded-lg border border-sky-200 bg-sky-50 p-3"
                    >
                      <span className="flex items-center gap-2 text-sm font-black text-board">
                        <Clock3 className="h-4 w-4 shrink-0" />
                        {chinaTime(r.reservedStartAt)}–
                        {chinaTime(r.reservedEndAt)}
                        <span className="ml-auto text-xs">
                          {booking.completed ? "已结束" : "已预约"}
                        </span>
                      </span>
                      <strong className="break-words text-sm">
                        {booking.label}
                      </strong>
                    </Link>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {free.map((slot) => (
                  <span
                    key={slot.startAt}
                    className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800"
                  >
                    {chinaTime(slot.startAt)}–{chinaTime(slot.endAt)} 空闲
                  </span>
                ))}
              </div>
              {busy.length === 0 && free.length === 0 ? (
                <p className="mt-3 text-sm text-muted">当天无可预约时段</p>
              ) : null}
            </section>
          );
        })
      )}
      <Link
        href="/"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-board px-4 text-sm font-bold text-white"
      >
        <CalendarDays className="h-4 w-4" />
        前往本周赛程预约
      </Link>
    </div>
  );
}
