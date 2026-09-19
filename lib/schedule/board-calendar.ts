import type {
  BoardReservationBoard,
  BoardReservationRow,
} from "@/components/tournament/BoardReservationPanel";
import { chinaDay, addDays } from "@/lib/schedule/weekly";

export function boardDayAvailability(
  board: BoardReservationBoard,
  date: string,
  reservations: BoardReservationRow[],
  now = new Date(),
  currentMatchId?: string,
) {
  const start = chinaDay(date).getTime();
  const end = addDays(chinaDay(date), 1).getTime();
  const busy = reservations
    .filter(
      (r) =>
        r.status === "active" &&
        r.boardId === board.id &&
        Date.parse(r.reservedStartAt) < end &&
        Date.parse(r.reservedEndAt) > start,
    )
    .sort((a, b) => a.reservedStartAt.localeCompare(b.reservedStartAt));
  const slots = board.slots?.length
    ? board.slots.filter((s) => s.status === "active")
    : [
        {
          availableStartAt: board.availableStartAt,
          availableEndAt: board.availableEndAt,
          dailyStartTime: null,
          dailyEndTime: null,
        },
      ];
  const free = new Map<string, { startAt: string; endAt: string }>();
  if (board.status !== "active") return { busy, free: [] };
  for (const slot of slots) {
    const from = slot.dailyStartTime
      ? Date.parse(`${date}T${slot.dailyStartTime}+08:00`)
      : Math.max(start, Date.parse(slot.availableStartAt));
    const to = slot.dailyEndTime
      ? Date.parse(`${date}T${slot.dailyEndTime}+08:00`)
      : Math.min(end, Date.parse(slot.availableEndAt));
    // Keep the configured minute (e.g. 17:30); never offer time outside an availability window.
    for (let cursor = from; cursor + 3600000 <= to; cursor += 3600000) {
      const finish = cursor + 3600000;
      if (
        cursor < now.getTime() ||
        busy.some(
          (r) =>
            r.matchId !== currentMatchId &&
            Date.parse(r.reservedStartAt) < finish &&
            Date.parse(r.reservedEndAt) > cursor,
        )
      )
        continue;
      const startAt = new Date(cursor).toISOString();
      free.set(startAt, { startAt, endAt: new Date(finish).toISOString() });
    }
  }
  return {
    busy,
    free: [...free.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)),
  };
}

export function chinaTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
