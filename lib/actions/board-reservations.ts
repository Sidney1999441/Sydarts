"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fromFormString } from "@/lib/utils";

const RESERVATION_DURATION_MS = 60 * 60 * 1000;
const RESERVATION_BOOKING_WINDOW_DAYS = 7;
const CHINA_TIME_ZONE_OFFSET = "+08:00";
const CHINA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export type BoardReservationActionState = {
  ok: boolean;
  message?: string | null;
  error?: string | null;
};

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function ok(message: string): BoardReservationActionState {
  return { ok: true, message, error: null };
}

function fail(error: unknown): BoardReservationActionState {
  if (error instanceof Error) return { ok: false, error: error.message, message: null };
  return { ok: false, error: "操作失败，请稍后重试。", message: null };
}

function parseDateTimeInput(value: FormDataEntryValue | null, label: string) {
  const raw = fromFormString(value);
  const date = new Date(normalizeChinaDateTime(raw));
  if (!raw || Number.isNaN(date.getTime())) {
    throw new Error(`请选择${label}。`);
  }
  return date;
}

function parseTimeInput(value: FormDataEntryValue | null, label: string) {
  const raw = fromFormString(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) throw new Error(`请选择${label}。`);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`${label}格式不正确。`);

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function assertDailyTimeRange(startTime: string, endTime: string) {
  if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
    throw new Error("可用结束时间必须晚于开始时间。");
  }
}

function normalizeChinaDateTime(raw: string) {
  if (!raw) return raw;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) return raw;

  const withSeconds = raw.length === 16 ? `${raw}:00` : raw;
  return `${withSeconds}${CHINA_TIME_ZONE_OFFSET}`;
}

function timeToMinutes(time: string) {
  const [hour = "0", minute = "0", second = "0"] = time.split(":");
  return Number(hour) * 60 + Number(minute) + Number(second) / 60;
}

function getChinaDatePart(value: string | Date) {
  return CHINA_DATE_FORMATTER.format(value instanceof Date ? value : new Date(value));
}

function toChinaDateTime(datePart: string, time: string) {
  return new Date(`${datePart}T${time}${CHINA_TIME_ZONE_OFFSET}`);
}

function addDaysToChinaDatePart(datePart: string, days: number) {
  const date = toChinaDateTime(datePart, "00:00:00");
  date.setUTCDate(date.getUTCDate() + days);
  return getChinaDatePart(date);
}

function assertReservationInsideBookingWindow(reservedStartAt: Date) {
  if (reservedStartAt < new Date()) {
    throw new Error("不能预约已经过去的时间。");
  }

  const today = getChinaDatePart(new Date());
  const reservedDate = getChinaDatePart(reservedStartAt);
  const maxDate = addDaysToChinaDatePart(today, RESERVATION_BOOKING_WINDOW_DAYS - 1);
  if (reservedDate < today || reservedDate > maxDate) {
    throw new Error(`只能预约今天起 ${RESERVATION_BOOKING_WINDOW_DAYS} 天内的机台。`);
  }
}

function getChinaTimeMinutes(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function friendlyReservationError(error: { message?: string; code?: string } | null) {
  if (!error) return "预约失败，请稍后重试。";
  if (error.code === "23P01" || error.message?.includes("conflict")) {
    return "该机台在这个时间已经被预约，请换一个空闲时段。";
  }
  if (error.message?.includes("outside board available time")) {
    return "预约时间不在该机台可使用时间段内。";
  }
  if (error.message?.includes("Board is not available")) {
    return "该机台已停用，不能继续预约。";
  }
  return error.message || "预约失败，请稍后重试。";
}

function friendlyBoardSlotError(error: { message?: string; code?: string } | null) {
  if (!error) return "保存时段失败，请稍后重试。";
  if (error.code === "23P01" || error.message?.includes("conflicting key value")) {
    return "这个可用时段和同机台已有时段重叠，请拆开保存。";
  }
  if (error.message?.includes("overlaps existing")) {
    return "这个每日可用时段和同机台已有时段重叠，请拆开保存。";
  }
  if (error.message?.includes("range_check")) {
    return "可用结束时间必须晚于开始时间。";
  }
  return error.message || "保存时段失败，请稍后重试。";
}

async function getMatchForReservation(admin: AdminClient, matchId: string, userId: string, isAdmin: boolean) {
  const { data: match, error } = await admin
    .from("matches")
    .select("id, tournament_id, participant_a_id, participant_b_id, status")
    .eq("id", matchId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!match) throw new Error("找不到这场比赛。");
  if (match.status === "completed" || match.status === "bye") {
    throw new Error("已结束的比赛不能再预约机台。");
  }

  if (isAdmin) return match;

  const participantIds = [match.participant_a_id, match.participant_b_id].filter(Boolean) as string[];
  if (participantIds.length === 0) throw new Error("这场比赛暂未生成完整对阵，不能预约。");

  const { data: participants, error: participantError } = await admin
    .from("tournament_participants")
    .select("id, user_id, team_id, participant_type")
    .in("id", participantIds);
  if (participantError) throw new Error(participantError.message);

  if ((participants || []).some((participant) => participant.user_id === userId)) return match;

  const teamIds = (participants || []).map((participant) => participant.team_id).filter(Boolean) as string[];
  if (teamIds.length === 0) throw new Error("只有本场比赛选手或管理员可以预约机台。");

  const { data: member } = await admin
    .from("team_members")
    .select("id")
    .in("team_id", teamIds)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!member) throw new Error("只有本场比赛选手或管理员可以预约机台。");
  return match;
}

async function refreshBoardAvailabilityWindow(admin: AdminClient, tournamentId: string, boardId: string) {
  const { data: tournament, error: tournamentError } = await admin
    .from("tournaments")
    .select("tournament_start_at")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tournamentError) throw new Error(tournamentError.message);
  if (!tournament?.tournament_start_at) throw new Error("找不到赛事开始时间。");

  const { data: slots, error } = await admin
    .from("tournament_board_time_slots")
    .select("daily_start_time, daily_end_time")
    .eq("tournament_id", tournamentId)
    .eq("board_id", boardId)
    .eq("status", "active")
    .order("daily_start_time");
  if (error) throw new Error(error.message);

  if (!slots || slots.length === 0) return;

  const datePart = getChinaDatePart(tournament.tournament_start_at);
  const firstStartTime = slots[0]?.daily_start_time;
  const lastEndTime = slots
    .map((slot) => slot.daily_end_time)
    .sort((a, b) => timeToMinutes(a) - timeToMinutes(b))
    .at(-1);

  if (!firstStartTime || !lastEndTime) return;

  const { error: updateError } = await admin
    .from("tournament_boards")
    .update({
      available_start_at: toChinaDateTime(datePart, firstStartTime).toISOString(),
      available_end_at: toChinaDateTime(datePart, lastEndTime).toISOString()
    })
    .eq("id", boardId)
    .eq("tournament_id", tournamentId);
  if (updateError) throw new Error(updateError.message);
}

function isInsideOneAvailableSlot({
  reservedStartAt,
  reservedEndAt,
  slots
}: {
  reservedStartAt: Date;
  reservedEndAt: Date;
  slots: Array<{ daily_start_time: string; daily_end_time: string; status?: string | null }>;
}) {
  const startMinutes = getChinaTimeMinutes(reservedStartAt);
  const endMinutes = getChinaTimeMinutes(reservedEndAt);

  return slots.some((slot) => {
    if (slot.status && slot.status !== "active") return false;
    return startMinutes >= timeToMinutes(slot.daily_start_time) && endMinutes <= timeToMinutes(slot.daily_end_time);
  });
}

function revalidateReservationPaths(tournamentId: string, matchId?: string) {
  revalidatePath("/");
  revalidatePath("/scorer");
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/tournaments/${tournamentId}/display`);
  revalidatePath(`/admin/tournaments/${tournamentId}/schedule`);
  if (matchId) revalidatePath(`/scorer/${matchId}`);
}

export async function saveTournamentBoardAction(formData: FormData) {
  try {
    await requireAdmin();
    const admin = createSupabaseAdminClient();
    const tournamentId = fromFormString(formData.get("tournament_id"));
    const boardId = fromFormString(formData.get("board_id"));
    const name = fromFormString(formData.get("name"));
    const dailyStartTime = fromFormString(formData.get("daily_start_time"));
    const dailyEndTime = fromFormString(formData.get("daily_end_time"));
    const status = fromFormString(formData.get("status")) === "disabled" ? "disabled" : "active";

    if (!tournamentId) throw new Error("缺少赛事 ID。");
    if (!name) throw new Error("请输入机台名称。");

    if (boardId) {
      const { error } = await admin
        .from("tournament_boards")
        .update({ name, status })
        .eq("id", boardId)
        .eq("tournament_id", tournamentId);
      if (error) throw new Error(error.message);
    } else {
      const startTime = parseTimeInput(dailyStartTime, "每日开始时间");
      const endTime = parseTimeInput(dailyEndTime, "每日结束时间");
      assertDailyTimeRange(startTime, endTime);

      const { data: tournament, error: tournamentError } = await admin
        .from("tournaments")
        .select("tournament_start_at")
        .eq("id", tournamentId)
        .maybeSingle();
      if (tournamentError) throw new Error(tournamentError.message);
      if (!tournament?.tournament_start_at) throw new Error("找不到赛事开始时间。");

      const datePart = getChinaDatePart(tournament.tournament_start_at);
      const availableStartAt = toChinaDateTime(datePart, startTime);
      const availableEndAt = toChinaDateTime(datePart, endTime);

      const { data: board, error } = await admin
        .from("tournament_boards")
        .insert({
          tournament_id: tournamentId,
          name,
          available_start_at: availableStartAt.toISOString(),
          available_end_at: availableEndAt.toISOString(),
          status
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (!board?.id) throw new Error("机台创建失败，请稍后重试。");

      const { error: slotError } = await admin.from("tournament_board_time_slots").insert({
        tournament_id: tournamentId,
        board_id: board.id,
        available_start_at: availableStartAt.toISOString(),
        available_end_at: availableEndAt.toISOString(),
        daily_start_time: startTime,
        daily_end_time: endTime,
        status
      });
      if (slotError) throw new Error(friendlyBoardSlotError(slotError));
    }

    revalidateReservationPaths(tournamentId);
  } catch (error) {
    throw error;
  }
}

export async function saveTournamentBoardSlotAction(formData: FormData) {
  try {
    await requireAdmin();
    const admin = createSupabaseAdminClient();
    const tournamentId = fromFormString(formData.get("tournament_id"));
    const boardId = fromFormString(formData.get("board_id"));
    const slotId = fromFormString(formData.get("slot_id"));
    const startTime = parseTimeInput(formData.get("daily_start_time"), "每日开始时间");
    const endTime = parseTimeInput(formData.get("daily_end_time"), "每日结束时间");
    const status = fromFormString(formData.get("status")) === "disabled" ? "disabled" : "active";

    if (!tournamentId || !boardId) throw new Error("缺少机台信息。");
    assertDailyTimeRange(startTime, endTime);

    const { data: board, error: boardError } = await admin
      .from("tournament_boards")
      .select("id")
      .eq("id", boardId)
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (boardError) throw new Error(boardError.message);
    if (!board) throw new Error("找不到该机台。");

    const { data: tournament, error: tournamentError } = await admin
      .from("tournaments")
      .select("tournament_start_at")
      .eq("id", tournamentId)
      .maybeSingle();
    if (tournamentError) throw new Error(tournamentError.message);
    if (!tournament?.tournament_start_at) throw new Error("找不到赛事开始时间。");

    const datePart = getChinaDatePart(tournament.tournament_start_at);

    const payload = {
      tournament_id: tournamentId,
      board_id: boardId,
      available_start_at: toChinaDateTime(datePart, startTime).toISOString(),
      available_end_at: toChinaDateTime(datePart, endTime).toISOString(),
      daily_start_time: startTime,
      daily_end_time: endTime,
      status
    };

    const result = slotId
      ? await admin
          .from("tournament_board_time_slots")
          .update(payload)
          .eq("id", slotId)
          .eq("board_id", boardId)
          .eq("tournament_id", tournamentId)
      : await admin.from("tournament_board_time_slots").insert(payload);
    if (result.error) throw new Error(friendlyBoardSlotError(result.error));

    await refreshBoardAvailabilityWindow(admin, tournamentId, boardId);
    revalidateReservationPaths(tournamentId);
  } catch (error) {
    throw error;
  }
}

export async function deactivateTournamentBoardSlotAction(formData: FormData) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const boardId = fromFormString(formData.get("board_id"));
  const slotId = fromFormString(formData.get("slot_id"));
  if (!tournamentId || !boardId || !slotId) throw new Error("缺少时段信息。");

  const { error } = await admin
    .from("tournament_board_time_slots")
    .update({ status: "disabled" })
    .eq("id", slotId)
    .eq("board_id", boardId)
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(error.message);

  await refreshBoardAvailabilityWindow(admin, tournamentId, boardId);
  revalidateReservationPaths(tournamentId);
}

export async function deactivateTournamentBoardAction(formData: FormData) {
  await requireAdmin();
  const admin = createSupabaseAdminClient();
  const tournamentId = fromFormString(formData.get("tournament_id"));
  const boardId = fromFormString(formData.get("board_id"));
  if (!tournamentId || !boardId) throw new Error("缺少机台信息。");

  const { error } = await admin
    .from("tournament_boards")
    .update({ status: "disabled" })
    .eq("id", boardId)
    .eq("tournament_id", tournamentId);
  if (error) throw new Error(error.message);
  revalidateReservationPaths(tournamentId);
}

export async function reserveMatchBoardAction(
  _previousState: BoardReservationActionState,
  formData: FormData
): Promise<BoardReservationActionState> {
  try {
    const { user, profile } = await requireUser();
    const admin = createSupabaseAdminClient();
    const matchId = fromFormString(formData.get("match_id"));
    const boardId = fromFormString(formData.get("board_id"));
    const reservedStartAt = parseDateTimeInput(formData.get("reserved_start_at"), "预约开始时间");
    const reservedEndAt = new Date(reservedStartAt.getTime() + RESERVATION_DURATION_MS);
    const isAdmin = profile?.role === "admin";

    if (!matchId || !boardId) throw new Error("请选择比赛和机台。");
    assertReservationInsideBookingWindow(reservedStartAt);

    const match = await getMatchForReservation(admin, matchId, user.id, isAdmin);
    const { data: board, error: boardError } = await admin
      .from("tournament_boards")
      .select("id, tournament_id, name, available_start_at, available_end_at, status")
      .eq("id", boardId)
      .maybeSingle();
    if (boardError) throw new Error(boardError.message);
    if (!board) throw new Error("找不到该机台。");
    if (board.tournament_id !== match.tournament_id) throw new Error("该机台不属于当前赛事。");
    if (board.status !== "active") throw new Error("该机台已停用，不能预约。");

    const { data: slots, error: slotError } = await admin
      .from("tournament_board_time_slots")
      .select("daily_start_time, daily_end_time, status")
      .eq("board_id", boardId)
      .order("daily_start_time");
    if (slotError) throw new Error(slotError.message);

    const insideAvailableTime =
      slots && slots.length > 0
        ? getChinaDatePart(reservedStartAt) === getChinaDatePart(reservedEndAt) &&
          isInsideOneAvailableSlot({
            reservedStartAt,
            reservedEndAt,
            slots: slots.filter((slot) => slot.status === "active")
          })
        : reservedStartAt >= new Date(board.available_start_at) && reservedEndAt <= new Date(board.available_end_at);
    if (!insideAvailableTime) {
      throw new Error("预约时间不在该机台可使用时间段内。");
    }

    const { data: conflicts, error: conflictError } = await admin
      .from("match_board_reservations")
      .select("id")
      .eq("board_id", boardId)
      .eq("status", "active")
      .lt("reserved_start_at", reservedEndAt.toISOString())
      .gt("reserved_end_at", reservedStartAt.toISOString())
      .neq("match_id", matchId)
      .limit(1);
    if (conflictError) throw new Error(conflictError.message);
    if ((conflicts || []).length > 0) throw new Error("该机台在这个时间已经被预约，请换一个空闲时段。");

    const { data: existing, error: existingError } = await admin
      .from("match_board_reservations")
      .select("id")
      .eq("match_id", matchId)
      .eq("status", "active")
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const reservationPayload = {
      tournament_id: match.tournament_id,
      match_id: matchId,
      board_id: boardId,
      reserved_start_at: reservedStartAt.toISOString(),
      reserved_end_at: reservedEndAt.toISOString(),
      created_by: user.id,
      status: "active"
    };

    const result = existing
      ? await admin.from("match_board_reservations").update(reservationPayload).eq("id", existing.id)
      : await admin.from("match_board_reservations").insert(reservationPayload);
    if (result.error) throw new Error(friendlyReservationError(result.error));

    const { error: matchUpdateError } = await admin
      .from("matches")
      .update({ scheduled_at: reservedStartAt.toISOString() })
      .eq("id", matchId);
    if (matchUpdateError) throw new Error(matchUpdateError.message);

    revalidateReservationPaths(match.tournament_id, matchId);
    return ok(`已预约 ${board.name}，默认时长 1 小时。`);
  } catch (error) {
    return fail(error);
  }
}

export async function cancelMatchBoardReservationAction(
  _previousState: BoardReservationActionState,
  formData: FormData
): Promise<BoardReservationActionState> {
  try {
    const { user, profile } = await requireUser();
    const admin = createSupabaseAdminClient();
    const matchId = fromFormString(formData.get("match_id"));
    if (!matchId) throw new Error("缺少比赛 ID。");

    const match = await getMatchForReservation(admin, matchId, user.id, profile?.role === "admin");
    const { data: reservation, error: reservationError } = await admin
      .from("match_board_reservations")
      .select("id")
      .eq("match_id", matchId)
      .eq("status", "active")
      .maybeSingle();
    if (reservationError) throw new Error(reservationError.message);
    if (!reservation) throw new Error("这场比赛当前没有有效预约。");

    const { error } = await admin
      .from("match_board_reservations")
      .update({ status: "cancelled" })
      .eq("id", reservation.id);
    if (error) throw new Error(error.message);

    const { error: matchUpdateError } = await admin
      .from("matches")
      .update({ scheduled_at: null })
      .eq("id", matchId);
    if (matchUpdateError) throw new Error(matchUpdateError.message);

    revalidateReservationPaths(match.tournament_id, matchId);
    return ok("已取消这场比赛的机台预约。");
  } catch (error) {
    return fail(error);
  }
}
