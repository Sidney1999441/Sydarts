"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getShanghaiWeekStart, normalizeWeekStart } from "@/lib/tournaments/weekly-stars";

export type WeeklyStarActionState = {
  ok: boolean;
  message: string | null;
  error: string | null;
};

const weeklyStarFormSchema = z.object({
  tournamentId: z.string().uuid(),
  intent: z.enum(["save", "reset"]),
  weekDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.string().uuid().optional(),
  reason: z.string().trim().max(240).optional()
});

export async function updateWeeklyStarOverrideAction(
  _previousState: WeeklyStarActionState,
  formData: FormData
): Promise<WeeklyStarActionState> {
  try {
    const { user } = await requireAdmin();
    const values = weeklyStarFormSchema.parse({
      tournamentId: formData.get("tournament_id"),
      intent: formData.get("intent"),
      weekDate: formData.get("week_date"),
      userId: optionalFormString(formData.get("user_id")),
      reason: optionalFormString(formData.get("reason"))
    });
    const weekStart = normalizeWeekStart(values.weekDate);
    if (!weekStart) return fail("日期格式不正确，请重新选择。");
    if (weekStart >= getShanghaiWeekStart()) {
      return fail("本周尚未结束，只能修改已经结束的自然周。");
    }

    const admin = createSupabaseAdminClient();
    const { data: tournament, error: tournamentError } = await admin
      .from("tournaments")
      .select("id")
      .eq("id", values.tournamentId)
      .maybeSingle();
    if (tournamentError) return fail(tournamentError);
    if (!tournament) return fail("赛事不存在。");

    if (values.intent === "reset") {
      const { error } = await admin
        .from("tournament_weekly_stars")
        .delete()
        .eq("tournament_id", values.tournamentId)
        .eq("week_start", weekStart);
      if (error) return fail(error);
      revalidateWeeklyStarPaths(values.tournamentId);
      return { ok: true, message: "已恢复该周的系统自动评选。", error: null };
    }

    if (!values.userId) return fail("请选择赛事选手。");
    const eligible = await isTournamentPlayer(admin, values.tournamentId, values.userId);
    if (!eligible) return fail("所选用户不是当前赛事的有效选手。");

    const { error } = await admin.from("tournament_weekly_stars").upsert(
      {
        tournament_id: values.tournamentId,
        week_start: weekStart,
        user_id: values.userId,
        reason: values.reason || "",
        created_by: user.id
      },
      { onConflict: "tournament_id,week_start" }
    );
    if (error) return fail(error);

    revalidateWeeklyStarPaths(values.tournamentId);
    return { ok: true, message: `已更新 ${weekStart} 当周赛事之星。`, error: null };
  } catch (error) {
    return fail(error);
  }
}

async function isTournamentPlayer(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  tournamentId: string,
  userId: string
) {
  const { data: participants, error } = await admin
    .from("tournament_participants")
    .select("user_id, team_id")
    .eq("tournament_id", tournamentId)
    .eq("status", "active");
  if (error) throw error;
  if ((participants || []).some((participant) => participant.user_id === userId)) return true;

  const teamIds = [
    ...new Set((participants || []).map((participant) => participant.team_id).filter(Boolean))
  ] as string[];
  if (teamIds.length === 0) return false;
  const { data: membership, error: membershipError } = await admin
    .from("team_members")
    .select("user_id")
    .in("team_id", teamIds)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  return Boolean(membership);
}

function revalidateWeeklyStarPaths(tournamentId: string) {
  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath(`/admin/tournaments/${tournamentId}/stars`);
  revalidatePath("/admin/tournaments");
}

function optionalFormString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fail(error: unknown): WeeklyStarActionState {
  const message =
    error instanceof z.ZodError
      ? error.issues[0]?.message || "提交内容格式不正确。"
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error);
  const missingTable = /tournament_weekly_stars|relation .* does not exist|schema cache/i.test(message);
  return {
    ok: false,
    message: null,
    error: missingTable ? "赛事之星数据表尚未创建，请先执行数据库迁移 023_tournament_weekly_stars.sql。" : message
  };
}
