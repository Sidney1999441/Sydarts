"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth/guards";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fromFormString } from "@/lib/utils";

const skillLevels = new Set(["Beginner", "Intermediate", "Advanced", "Pro"]);
const userRoles = new Set(["user", "admin"]);
const userStatuses = new Set(["active", "banned"]);

function parseRating(value: FormDataEntryValue | null, fallback = 1000) {
  const rating = Number(value || fallback);
  if (!Number.isFinite(rating)) return fallback;
  return Math.max(0, Math.round(rating));
}

function parseOption(value: string, allowed: Set<string>, fallback: string) {
  return allowed.has(value) ? value : fallback;
}

export async function updateUserAdminFieldsAction(formData: FormData) {
  await requireAdmin();
  const userId = fromFormString(formData.get("user_id"));
  const displayName = fromFormString(formData.get("display_name"));
  const phone = fromFormString(formData.get("phone")) || null;
  const bio = fromFormString(formData.get("bio")) || null;
  const role = parseOption(fromFormString(formData.get("role")), userRoles, "user");
  const status = parseOption(fromFormString(formData.get("status")), userStatuses, "active");
  const tournamentRating = parseRating(formData.get("tournament_rating"));
  const casualRating = parseRating(formData.get("casual_rating"), tournamentRating);
  const softRating = parseRating(formData.get("soft_rating"), tournamentRating);
  const tournamentSkillLevel = parseOption(
    fromFormString(formData.get("tournament_skill_level")),
    skillLevels,
    "Beginner"
  );
  const casualSkillLevel = parseOption(
    fromFormString(formData.get("casual_skill_level")),
    skillLevels,
    tournamentSkillLevel
  );
  const softSkillLevel = parseOption(
    fromFormString(formData.get("soft_skill_level")),
    skillLevels,
    casualSkillLevel
  );
  const supabase = createSupabaseAdminClient();

  if (!userId) throw new Error("缺少用户 ID。");
  if (!displayName) throw new Error("请输入用户显示名。");

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      phone,
      bio,
      role,
      status,
      rating: tournamentRating,
      skill_level: tournamentSkillLevel,
      tournament_rating: tournamentRating,
      casual_rating: casualRating,
      soft_rating: softRating,
      tournament_skill_level: tournamentSkillLevel,
      casual_skill_level: casualSkillLevel,
      soft_skill_level: softSkillLevel
    })
    .eq("id", userId);

  if (error) throw new Error(error.message);
  await supabase
    .from("user_stats")
    .upsert({ user_id: userId, current_rating: tournamentRating }, { onConflict: "user_id" });
  await supabase
    .from("general_user_stats")
    .upsert({ user_id: userId, current_rating: casualRating }, { onConflict: "user_id" });
  await supabase
    .from("soft_user_stats")
    .upsert({ user_id: userId, current_rating: softRating }, { onConflict: "user_id" });

  revalidatePath("/admin/users");
  revalidatePath("/profile");
}

export async function searchPlayerProfilesAction(query: string) {
  const { user } = await requireUser();
  const keyword = query.trim();
  if (keyword.length < 2) return [];

  const admin = createSupabaseAdminClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyword);
  const isUid = /^[0-9]{1,6}$/.test(keyword);
  const request = admin
    .from("profiles")
    .select("id, uid, display_name")
    .neq("id", user.id)
    .eq("status", "active")
    .limit(8);

  const { data, error } = isUuid
    ? await request.eq("id", keyword)
    : isUid
      ? await request.ilike("uid", `${keyword}%`)
      : await request.ilike("display_name", `%${keyword}%`);

  if (error) throw new Error(error.message);
  return (data || []).map((profile) => ({
    id: profile.id,
    uid: profile.uid,
    displayName: profile.display_name || "Unnamed player"
  }));
}
