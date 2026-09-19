import { describe, expect, it } from "vitest";
import { classifyWeeklyMatch, startOfChinaWeek } from "@/lib/schedule/weekly";
import { boardDayAvailability } from "@/lib/schedule/board-calendar";
import type {
  BoardReservationBoard,
  BoardReservationRow,
} from "@/components/tournament/BoardReservationPanel";

const tournament = {
  dart_mode: "mixed_alternating",
  format: "league_playoff",
  tournament_start_at: "2026-08-10T16:30:00Z",
};
const now = new Date("2026-08-26T04:00:00Z");
const match = {
  status: "not_started",
  stage: "group",
  round_number: 4,
  scheduled_at: null,
};
describe("weekly schedule carry-over", () => {
  it("keeps an unfinished prior-week match after both current results are recorded", () => {
    const fixtures = [
      match,
      {
        ...match,
        round_number: 5,
        status: "completed",
        updated_at: now.toISOString(),
      },
      {
        ...match,
        round_number: 6,
        status: "completed",
        updated_at: now.toISOString(),
      },
    ];
    const selected = fixtures.map((item) =>
      classifyWeeklyMatch(item, tournament, now),
    );
    expect(selected.filter((item) => item.current)).toHaveLength(3);
    expect(selected[0].overdue).toBe(true);
  });
  it("keeps every unfinished match in the same week instead of consuming one mode slot", () => {
    expect(
      classifyWeeklyMatch({ ...match, round_number: 5 }, tournament, now)
        .current,
    ).toBe(true);
    expect(
      classifyWeeklyMatch(
        {
          ...match,
          round_number: 5,
          status: "completed",
          updated_at: now.toISOString(),
        },
        tournament,
        now,
      ).current,
    ).toBe(true);
  });
  it("does not pull next week into a bye week", () => {
    expect(
      classifyWeeklyMatch({ ...match, round_number: 7 }, tournament, now)
        .current,
    ).toBe(false);
  });
  it("keeps multiple overdue matches even when booked for a later day", () => {
    for (const round_number of [1, 2, 3, 4])
      expect(
        classifyWeeklyMatch(
          { ...match, round_number },
          tournament,
          now,
          "2026-09-01T04:00:00Z",
        ),
      ).toEqual({ current: true, overdue: true });
  });
  it("removes an old result next week but carries its unplayed partner", () => {
    const next = new Date("2026-08-31T03:00:00Z");
    expect(
      classifyWeeklyMatch(
        { ...match, status: "completed", updated_at: now.toISOString() },
        tournament,
        next,
      ).current,
    ).toBe(false);
    expect(classifyWeeklyMatch(match, tournament, next).overdue).toBe(true);
  });
  it("uses Shanghai midnight regardless of the server timezone", () => {
    expect(
      startOfChinaWeek(new Date("2026-08-16T15:59:59Z")).toISOString(),
    ).toBe("2026-08-09T16:00:00.000Z");
    expect(
      startOfChinaWeek(new Date("2026-08-16T16:00:00Z")).toISOString(),
    ).toBe("2026-08-16T16:00:00.000Z");
  });
  it("does not classify knockout round numbers as overdue league rounds", () => {
    expect(
      classifyWeeklyMatch(
        { ...match, stage: "knockout", round_number: 1 },
        tournament,
        now,
      ).current,
    ).toBe(false);
  });
});

const board: BoardReservationBoard = {
  id: "b",
  name: "Board",
  status: "active",
  availableStartAt: "",
  availableEndAt: "",
  slots: [
    {
      id: "s",
      boardId: "b",
      status: "active",
      availableStartAt: "",
      availableEndAt: "",
      dailyStartTime: "17:30:00",
      dailyEndTime: "20:30:00",
    },
  ],
};
const booking: BoardReservationRow = {
  id: "r",
  boardId: "b",
  matchId: "m",
  status: "active",
  reservedStartAt: "2026-08-26T10:30:00Z",
  reservedEndAt: "2026-08-26T11:30:00Z",
};
describe("board calendar availability", () => {
  it("preserves half-hour starts and excludes reservations", () => {
    const result = boardDayAvailability(board, "2026-08-26", [booking], now);
    expect(result.busy).toHaveLength(1);
    expect(result.free.map((slot) => slot.startAt)).toEqual([
      "2026-08-26T09:30:00.000Z",
      "2026-08-26T11:30:00.000Z",
    ]);
  });
  it("ignores cancelled reservations and the current match during rescheduling", () => {
    expect(
      boardDayAvailability(
        board,
        "2026-08-26",
        [{ ...booking, status: "cancelled" }],
        now,
      ).free,
    ).toHaveLength(3);
    expect(
      boardDayAvailability(board, "2026-08-26", [booking], now, "m").free,
    ).toHaveLength(3);
  });
  it("handles partial overlaps without blocking adjacent bookings", () => {
    const result = boardDayAvailability(
      board,
      "2026-08-26",
      [{ ...booking, reservedStartAt: "2026-08-26T10:00:00Z" }],
      now,
    );
    expect(result.free.map((slot) => slot.startAt)).toEqual([
      "2026-08-26T11:30:00.000Z",
    ]);
  });
  it("hides past slots and never offers a disabled board", () => {
    expect(
      boardDayAvailability(
        board,
        "2026-08-26",
        [],
        new Date("2026-08-26T11:31:00Z"),
      ).free,
    ).toEqual([]);
    expect(
      boardDayAvailability(
        { ...board, status: "disabled" },
        "2026-08-26",
        [booking],
        now,
      ).free,
    ).toEqual([]);
  });
  it("does not fall back to legacy hours when all configured windows are disabled", () => {
    expect(
      boardDayAvailability(
        {
          ...board,
          slots: board.slots!.map((s) => ({ ...s, status: "disabled" })),
        },
        "2026-08-26",
        [],
        now,
      ).free,
    ).toEqual([]);
  });
  it("does not mistake a short same-day window for overnight availability", () => {
    const short = {
      ...board,
      slots: board.slots!.map((s) => ({ ...s, dailyEndTime: "18:00:00" })),
    };
    expect(boardDayAvailability(short, "2026-08-26", [], now).free).toEqual([]);
  });
});
